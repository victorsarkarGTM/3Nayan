import { AppError, adminReassignSchema } from '../_shared/core/index.ts';
import { audit } from '../_shared/audit.ts';
import { getCaller, requireStaff } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';
import { loadPractitioner } from '../_shared/practitioner.ts';

/** Super-admins can move an application to another active reviewer (spec §7). */
export async function adminReassign(req: Request, deps: Deps) {
  const caller = await getCaller(req, deps);
  requireStaff(caller, ['super_admin']);
  const { practitionerId, reviewerId } = await parseBody(req, adminReassignSchema);
  const p = await loadPractitioner(deps, practitionerId);
  const { data: target } = await deps.db.from('staff').select('role,active').eq('user_id', reviewerId).maybeSingle();
  if (!target?.active || !['reviewer', 'super_admin'].includes(target.role)) {
    throw new AppError('validation_failed', [{ path: ['reviewerId'], message: 'Choose an active reviewer' }]);
  }
  const { error } = await deps.db.from('practitioners').update({ assigned_reviewer_id: reviewerId }).eq('id', p.id);
  if (error) throw new Error(error.message);
  await deps.db.from('trial_calls').update({ reviewer_id: reviewerId }).eq('practitioner_id', p.id).in('status', ['proposed', 'scheduled']);
  await audit(deps, {
    actorId: caller.userId,
    actorKind: 'staff',
    action: 'practitioner.reassign',
    targetTable: 'practitioners',
    targetId: p.id,
    metadata: { from: p.assigned_reviewer_id, to: reviewerId },
  });
  return { assignedReviewerId: reviewerId };
}
