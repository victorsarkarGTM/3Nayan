import { AppError, trialIdSchema } from '../_shared/core/index.ts';
import { getCaller } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';
import { transition } from '../_shared/practitioner.ts';
import { loadTrial } from '../_shared/trials.ts';

/** The practitioner may ask for new slots once per application. */
export async function trialRescheduleRequest(req: Request, deps: Deps) {
  const caller = await getCaller(req, deps);
  const { trialId } = await parseBody(req, trialIdSchema);
  const trial = await loadTrial(deps, trialId);
  if (trial.practitioner_user_id !== caller.userId) throw new AppError('forbidden');
  if (trial.status !== 'scheduled') throw new AppError('invalid_transition');
  const { count } = await deps.db
    .from('trial_calls')
    .select('id', { count: 'exact', head: true })
    .eq('practitioner_id', trial.practitioner_id)
    .eq('reschedule_used', true);
  await transition(deps, {
    practitionerId: trial.practitioner_id,
    action: 'trial_reschedule',
    actor: { kind: 'practitioner' },
    actorUserId: caller.userId,
    expectedStatus: 'trial_scheduled',
    ctx: { rescheduleUsed: (count ?? 0) > 0 },
  });
  await deps.db.from('trial_calls').update({ status: 'cancelled', reschedule_used: true }).eq('id', trial.id);
  await deps.db.from('attention_items').insert({
    kind: 'trial_reschedule_requested',
    target_id: trial.practitioner_id,
    metadata: { trialId: trial.id, reviewerId: trial.reviewer_id },
  });
  return { status: 'in_review' };
}
