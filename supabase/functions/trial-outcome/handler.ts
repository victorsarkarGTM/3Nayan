import { AppError, trialOutcomeSchema } from '../_shared/core/index.ts';
import { getCaller, requireStaff } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';
import { transition } from '../_shared/practitioner.ts';
import { loadTrial } from '../_shared/trials.ts';

export async function trialOutcome(req: Request, deps: Deps) {
  const caller = await getCaller(req, deps);
  requireStaff(caller, ['reviewer', 'super_admin']);
  const { trialId, outcome, notes } = await parseBody(req, trialOutcomeSchema);
  const trial = await loadTrial(deps, trialId);
  if (trial.reviewer_id !== caller.userId && caller.staffRole !== 'super_admin') throw new AppError('forbidden');
  if (trial.status !== 'scheduled') throw new AppError('invalid_transition');
  const { data: updated, error } = await deps.db
    .from('trial_calls')
    .update({ status: outcome, outcome_recorded_at: deps.now().toISOString() })
    .eq('id', trial.id)
    .eq('status', 'scheduled')
    .select('id');
  if (error) throw new Error(error.message);
  if (!updated?.length) throw new AppError('conflict');
  // Reviewer notes are internal: stored with the staff-only review notes, never on the trial row.
  const { error: noteError } = await deps.db.from('review_notes').insert({
    practitioner_id: trial.practitioner_id,
    staff_id: caller.userId,
    body: `Trial call (${outcome}): ${notes}`,
  });
  if (noteError) throw new Error(noteError.message);
  if (outcome === 'missed') {
    await transition(deps, {
      practitionerId: trial.practitioner_id,
      action: 'trial_missed',
      actor: { kind: 'staff', role: caller.staffRole },
      actorUserId: caller.userId,
      expectedStatus: 'trial_scheduled',
      ctx: {},
    });
  }
  return { status: outcome };
}
