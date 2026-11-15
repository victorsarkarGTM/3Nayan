import { AppError, isWithinJoinWindow, trialIdSchema } from '../_shared/core/index.ts';
import { getCaller, requireStaff } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';
import { loadTrial } from '../_shared/trials.ts';

/** 100ms room token for the assigned reviewer or the applicant, only inside the join window. */
export async function trialJoinToken(req: Request, deps: Deps) {
  const caller = await getCaller(req, deps);
  const { trialId } = await parseBody(req, trialIdSchema);
  const trial = await loadTrial(deps, trialId);
  let role: 'reviewer' | 'applicant';
  if (trial.reviewer_id === caller.userId) {
    requireStaff(caller, ['reviewer', 'super_admin']);
    role = 'reviewer';
  } else if (trial.practitioner_user_id === caller.userId) {
    role = 'applicant';
  } else {
    throw new AppError('forbidden');
  }
  if (trial.status !== 'scheduled' || !trial.scheduled_at || !trial.hms_room_id) throw new AppError('invalid_transition');
  if (!isWithinJoinWindow(new Date(trial.scheduled_at), deps.now())) throw new AppError('outside_join_window');
  const token = await deps.hms.authToken(trial.hms_room_id, caller.userId, role);
  return { token, roomId: trial.hms_room_id, role };
}
