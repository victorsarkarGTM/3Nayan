import {
  AppError,
  KYC_MAX_ATTEMPTS_PER_24H,
  classifyNameMatch,
  nameMatchScore,
} from './core/index.ts';
import type { Deps } from './deps.ts';
import { ProviderError } from './providers/errors.ts';

export type KycKind = 'pan' | 'aadhaar' | 'bank';
type CheckRow = {
  id: string;
  kind: KycKind;
  status: string;
  verified_name: string | null;
  attempts: number;
  attempt_times: string[];
};

/** The caller's practitioner, which must exist and be editable (draft / changes_requested). */
export async function editablePractitionerFor(deps: Deps, userId: string): Promise<{ id: string; status: string }> {
  const { data } = await deps.db.from('practitioners').select('id,status').eq('user_id', userId).maybeSingle();
  if (!data) throw new AppError('not_found');
  if (!['draft', 'changes_requested'].includes(data.status)) throw new AppError('invalid_transition');
  return data;
}

async function getOrCreateCheck(deps: Deps, practitionerId: string, kind: KycKind): Promise<CheckRow> {
  const { data, error } = await deps.db
    .from('verification_checks')
    .upsert({ practitioner_id: practitionerId, kind }, { onConflict: 'practitioner_id,kind', ignoreDuplicates: true })
    .select('id,kind,status,verified_name,attempts,attempt_times');
  if (error) throw new Error(error.message);
  if (data?.[0]) return data[0] as CheckRow;
  const { data: row, error: e2 } = await deps.db
    .from('verification_checks')
    .select('id,kind,status,verified_name,attempts,attempt_times')
    .eq('practitioner_id', practitionerId)
    .eq('kind', kind)
    .single();
  if (e2) throw new Error(e2.message);
  return row as CheckRow;
}

const recentAttempts = (row: CheckRow, now: Date) =>
  row.attempt_times.filter((t) => now.getTime() - new Date(t).getTime() < 24 * 3600_000);

export async function assertAttemptsAvailable(deps: Deps, practitionerId: string, kind: KycKind): Promise<CheckRow> {
  const row = await getOrCreateCheck(deps, practitionerId, kind);
  if (recentAttempts(row, deps.now()).length >= KYC_MAX_ATTEMPTS_PER_24H) throw new AppError('kyc_attempts_exhausted');
  return row;
}

/** Runs a provider call; outages become provider_unavailable and change nothing. */
export async function callProvider<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ProviderError) {
      console.error('verification provider error', e.message);
      throw new AppError('provider_unavailable');
    }
    throw e;
  }
}

/**
 * Record a completed provider result (counts as an attempt), then recompute name matching across
 * every valid check of this practitioner: a check's score is its worst match against the others.
 */
export async function recordCheck(
  deps: Deps,
  row: CheckRow,
  practitionerId: string,
  result: { valid: boolean; verifiedName: string; providerRef: string; extra?: Record<string, unknown> },
): Promise<{ status: string; nameMatchScore: number | null }> {
  const now = deps.now();
  const times = [...recentAttempts(row, now).map((t) => new Date(t).toISOString()), now.toISOString()];
  const { error } = await deps.db
    .from('verification_checks')
    .update({
      status: result.valid ? 'passed' : 'failed',
      verified_name: result.valid ? result.verifiedName : null,
      provider_ref: result.providerRef,
      attempts: row.attempts + 1,
      attempt_times: times,
      last_error: null,
      checked_at: now.toISOString(),
      ...(result.extra ?? {}),
    })
    .eq('id', row.id);
  if (error) throw new Error(error.message);
  await recomputeNameMatch(deps, practitionerId);
  const { data } = await deps.db.from('verification_checks').select('status,name_match_score').eq('id', row.id).single();
  return { status: data!.status, nameMatchScore: data!.name_match_score === null ? null : Number(data!.name_match_score) };
}

async function recomputeNameMatch(deps: Deps, practitionerId: string) {
  const { data } = await deps.db
    .from('verification_checks')
    .select('id,status,verified_name')
    .eq('practitioner_id', practitionerId)
    .in('status', ['passed', 'flagged']);
  const valid = (data ?? []).filter((c: { verified_name: string | null }) => c.verified_name);
  for (const c of valid) {
    const others = valid.filter((o: { id: string }) => o.id !== c.id);
    const score = others.length
      ? Math.min(...others.map((o: { verified_name: string }) => nameMatchScore(c.verified_name, o.verified_name)))
      : 1;
    await deps.db
      .from('verification_checks')
      .update({ name_match_score: Number(score.toFixed(3)), status: classifyNameMatch([score]) })
      .eq('id', c.id);
  }
}
