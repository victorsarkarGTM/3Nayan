import { AppError, KYC_MAX_ATTEMPTS_PER_24H, classifyNameMatch, nameMatchScore } from './core/index.ts';
import type { Deps } from './deps.ts';
import { ProviderError } from './providers/errors.ts';

export type KycKind = 'pan' | 'aadhaar' | 'bank';

/** Map the KYC SQL functions' exceptions to API error codes. */
function rpcError(error: { message: string }): never {
  if (error.message.includes('not_editable')) throw new AppError('invalid_transition');
  if (error.message.includes('kyc_attempts_exhausted')) throw new AppError('kyc_attempts_exhausted');
  throw new Error(error.message);
}

/** The caller's practitioner, which must exist and be editable (draft / changes_requested). */
export async function editablePractitionerFor(deps: Deps, userId: string): Promise<{ id: string; status: string }> {
  const { data } = await deps.db.from('practitioners').select('id,status').eq('user_id', userId).maybeSingle();
  if (!data) throw new AppError('not_found');
  if (!['draft', 'changes_requested'].includes(data.status)) throw new AppError('invalid_transition');
  return data;
}

/** Non-binding pre-check (used before starting DigiLocker); the binding check is reserveAttempt. */
export async function assertAttemptsAvailable(deps: Deps, practitionerId: string, kind: KycKind): Promise<void> {
  const { data } = await deps.db
    .from('verification_checks')
    .select('attempt_times')
    .eq('practitioner_id', practitionerId)
    .eq('kind', kind)
    .maybeSingle();
  const now = deps.now().getTime();
  const recent = (data?.attempt_times ?? []).filter((t: string) => now - new Date(t).getTime() < 24 * 3600_000);
  if (recent.length >= KYC_MAX_ATTEMPTS_PER_24H) throw new AppError('kyc_attempts_exhausted');
}

export type Reservation = { checkId: string; at: string };

/** Atomically reserve one of the 3 attempts per 24h (also requires an editable application). */
export async function reserveAttempt(deps: Deps, practitionerId: string, kind: KycKind): Promise<Reservation> {
  const at = deps.now().toISOString();
  const { data, error } = await deps.db.rpc('reserve_kyc_attempt', {
    p_practitioner_id: practitionerId,
    p_kind: kind,
    p_now: at,
  });
  if (error) rpcError(error);
  return { checkId: data as string, at };
}

/**
 * Run a provider call under a reservation. Outages release the reservation (the attempt doesn't
 * count) and become provider_unavailable; nothing else is written.
 */
export async function callProvider<T>(deps: Deps, r: Reservation, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ProviderError) {
      console.error('verification provider error', e.message);
      await deps.db.rpc('release_kyc_attempt', { p_check_id: r.checkId, p_at: r.at });
      throw new AppError('provider_unavailable');
    }
    throw e;
  }
}

export async function storeSecret(deps: Deps, fn: 'store_pan' | 'store_bank_account', args: Record<string, string>) {
  const { error } = await deps.db.rpc(fn, args);
  if (error) rpcError(error);
}

/**
 * Record a completed provider result (only while the application is editable), then recompute name
 * matching across the valid checks: a check's score is its worst match against the others.
 */
export async function recordResult(
  deps: Deps,
  r: Reservation,
  practitionerId: string,
  result: { valid: boolean; verifiedName: string; providerRef: string; extra?: Record<string, unknown> },
): Promise<{ status: string; nameMatchScore: number | null }> {
  const { error } = await deps.db.rpc('apply_kyc_result', {
    p_check_id: r.checkId,
    p_valid: result.valid,
    p_verified_name: result.verifiedName,
    p_provider_ref: result.providerRef,
    p_extra: result.extra ?? {},
  });
  if (error) rpcError(error);
  await recomputeNameMatch(deps, practitionerId);
  const { data } = await deps.db.from('verification_checks').select('status,name_match_score').eq('id', r.checkId).single();
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
