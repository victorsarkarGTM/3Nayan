import {
  AppError,
  kycStatuses,
  planTransition,
  snapshotFromRow,
  type Actor,
  type ApplicationSnapshot,
  type PractitionerRow,
  type PractitionerStatus,
  type TransitionAction,
  type TransitionContext,
} from './core/index.ts';
import type { Deps } from './deps.ts';

export type PractitionerRecord = PractitionerRow & {
  id: string;
  user_id: string;
  status: PractitionerStatus;
  assigned_reviewer_id: string | null;
  reapply_after: string | null;
  updated_at: string;
};

export async function loadPractitioner(deps: Deps, id: string): Promise<PractitionerRecord> {
  const { data } = await deps.db.from('practitioners').select('*').eq('id', id).maybeSingle();
  if (!data) throw new AppError('not_found');
  return data as PractitionerRecord;
}

export async function practitionerForUser(deps: Deps, userId: string): Promise<PractitionerRecord> {
  const { data } = await deps.db.from('practitioners').select('*').eq('user_id', userId).maybeSingle();
  if (!data) throw new AppError('not_found');
  return data as PractitionerRecord;
}

export async function loadSnapshot(deps: Deps, p: PractitionerRecord): Promise<ApplicationSnapshot> {
  const [cats, docs, checks] = await Promise.all([
    deps.db.from('practitioner_categories').select('category_id').eq('practitioner_id', p.id),
    deps.db.from('practitioner_documents').select('id').eq('practitioner_id', p.id),
    deps.db.from('verification_checks').select('kind,status').eq('practitioner_id', p.id),
  ]);
  return snapshotFromRow(p, {
    subcategoryIds: (cats.data ?? []).map((c: { category_id: string }) => c.category_id),
    certificateIds: (docs.data ?? []).map((d: { id: string }) => d.id),
    kyc: kycStatuses(checks.data ?? []),
  });
}

export async function currentLegalVersions(deps: Deps): Promise<Record<string, string>> {
  const { data } = await deps.db.from('platform_settings').select('value').eq('key', 'legal_versions').maybeSingle();
  return (data?.value as Record<string, string>) ?? {};
}

type TransitionInput = {
  practitionerId: string;
  action: TransitionAction;
  actor: Actor;
  actorUserId: string | null;
  expectedStatus: PractitionerStatus;
  ctx: Omit<TransitionContext, 'now'>;
  patch?: Record<string, string | null>;
  /** Apply only if the row hasn't changed since this snapshot (submit). */
  expectedUpdatedAt?: string;
};

/** Close any open trial when an application leaves review (reject, changes, suspend, deletion). */
export async function cancelOpenTrials(deps: Deps, practitionerId: string): Promise<void> {
  const { error } = await deps.db
    .from('trial_calls')
    .update({ status: 'cancelled' })
    .eq('practitioner_id', practitionerId)
    .in('status', ['proposed', 'scheduled']);
  if (error) throw new Error(error.message);
}

/**
 * Validate with the shared status machine, then apply atomically (conditional on expectedStatus).
 * A stale call returns the current status as a no-op when the same actor already did the same
 * action; otherwise it is a conflict.
 */
export async function transition(deps: Deps, t: TransitionInput): Promise<{ status: PractitionerStatus; noop: boolean }> {
  const plan = planTransition(t.expectedStatus, t.action, t.actor, { ...t.ctx, now: deps.now() });
  if (!plan.ok) throw new AppError(plan.code);
  const actorKind = t.actor.kind === 'staff' ? 'staff' : t.actor.kind === 'practitioner' ? 'user' : 'system';
  const { data: applied, error } = await deps.db.rpc('apply_practitioner_transition', {
    p_id: t.practitionerId,
    p_from: t.expectedStatus,
    p_to: plan.to,
    p_actor: t.actorUserId,
    p_actor_kind: actorKind,
    p_action: t.action,
    p_reason: t.ctx.reason?.trim() || null,
    p_patch: t.patch ?? {},
    p_expected_updated_at: t.expectedUpdatedAt ?? null,
  });
  if (error) throw new Error(error.message);
  if (applied) return { status: plan.to, noop: false };

  const current = await loadPractitioner(deps, t.practitionerId);
  if (current.status === plan.to) {
    const { data: last } = await deps.db
      .from('practitioner_status_history')
      .select('action,actor_id,to_status')
      .eq('practitioner_id', t.practitionerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last && last.action === t.action && last.actor_id === t.actorUserId && last.to_status === plan.to) {
      return { status: plan.to, noop: true };
    }
  }
  throw new AppError('conflict');
}
