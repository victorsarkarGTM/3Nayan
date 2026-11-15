import { AppError, formatIST, trialProposeSchema, validateProposedSlots } from '../_shared/core/index.ts';
import { getCaller, requireStaff } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';
import { notify } from '../_shared/notifications/notify.ts';
import { loadPractitioner } from '../_shared/practitioner.ts';

/** Reviewer proposes 3 slots (checked against the server clock, never the client's). */
export async function trialPropose(req: Request, deps: Deps) {
  const caller = await getCaller(req, deps);
  requireStaff(caller, ['reviewer', 'super_admin']);
  const { practitionerId, slots } = await parseBody(req, trialProposeSchema);
  const p = await loadPractitioner(deps, practitionerId);
  if (p.status !== 'in_review') throw new AppError('invalid_transition');
  if (p.assigned_reviewer_id && p.assigned_reviewer_id !== caller.userId && caller.staffRole !== 'super_admin') {
    throw new AppError('forbidden');
  }
  const check = validateProposedSlots(slots, deps.now());
  if (!check.ok) throw new AppError('validation_failed', [{ path: ['slots'], message: check.reason }]);

  const starts = [...check.starts].sort((a, b) => a.getTime() - b.getTime());
  const iso = starts.map((d) => d.toISOString());

  // An identical open proposal (double-click, retry) is a no-op.
  const { data: open } = await deps.db
    .from('trial_calls')
    .select('id,proposed_slots')
    .eq('practitioner_id', p.id)
    .eq('status', 'proposed')
    .maybeSingle();
  const same =
    open &&
    open.proposed_slots.length === iso.length &&
    open.proposed_slots.every((s: string, i: number) => new Date(s).getTime() === new Date(iso[i]!).getTime());
  if (same) return { trialId: open.id };
  if (open) await deps.db.from('trial_calls').update({ status: 'cancelled' }).eq('id', open.id).eq('status', 'proposed');

  const { data, error } = await deps.db
    .from('trial_calls')
    .insert({
      practitioner_id: p.id,
      reviewer_id: caller.userId,
      proposed_slots: iso,
      proposed_at: deps.now().toISOString(),
      status: 'proposed',
    })
    .select('id')
    .single();
  // One open trial per practitioner (unique index): a concurrent proposal loses with a conflict.
  if (error?.code === '23505') throw new AppError('conflict');
  if (error) throw new Error(error.message);
  await notify(deps, p.user_id, 'trial_proposed', {
    name: p.display_name ?? '',
    slots: starts.map(formatIST).join(' | '),
  });
  return { trialId: data.id };
}
