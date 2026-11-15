import { AppError, TRIAL_MIN_LEAD_HOURS, trialSelectSchema } from '../_shared/core/index.ts';
import { getCaller } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';
import { transition } from '../_shared/practitioner.ts';
import { loadTrial } from '../_shared/trials.ts';

export async function trialSelect(req: Request, deps: Deps) {
  const caller = await getCaller(req, deps);
  const { trialId, slotStart } = await parseBody(req, trialSelectSchema);
  const trial = await loadTrial(deps, trialId);
  if (trial.practitioner_user_id !== caller.userId) throw new AppError('forbidden');
  if (trial.status !== 'proposed' || trial.practitioner_status !== 'in_review') throw new AppError('invalid_transition');
  const chosen = new Date(slotStart).getTime();
  const offered = trial.proposed_slots.some((s) => new Date(s).getTime() === chosen);
  const leadOk = chosen >= deps.now().getTime() + TRIAL_MIN_LEAD_HOURS * 3600_000;
  if (!offered || !leadOk) {
    throw new AppError('validation_failed', [{ path: ['slotStart'], message: offered ? 'too_soon' : 'not_offered' }]);
  }
  const { roomId } = await deps.hms.createRoom(`trial-${trial.id}`);
  const { data: updated, error } = await deps.db
    .from('trial_calls')
    .update({ status: 'scheduled', scheduled_at: new Date(chosen).toISOString(), hms_room_id: roomId })
    .eq('id', trial.id)
    .eq('status', 'proposed')
    .select('id');
  if (error) throw new Error(error.message);
  if (!updated?.length) throw new AppError('conflict');
  await transition(deps, {
    practitionerId: trial.practitioner_id,
    action: 'schedule_trial',
    actor: { kind: 'system' },
    actorUserId: null,
    expectedStatus: 'in_review',
    ctx: {},
  });
  return { scheduledAt: new Date(chosen).toISOString() };
}
