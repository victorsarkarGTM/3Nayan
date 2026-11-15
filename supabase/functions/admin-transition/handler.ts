import {
  AppError,
  REAPPLY_WAIT_DAYS,
  adminTransitionSchema,
  formatIST,
  type StaffRole,
} from '../_shared/core/index.ts';
import { getCaller, requireStaff } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';
import { notify } from '../_shared/notifications/notify.ts';
import { provisionLinkedAccount } from '../_shared/linked-account.ts';
import { loadPractitioner, transition } from '../_shared/practitioner.ts';

const ALL_STAFF: StaffRole[] = ['reviewer', 'support', 'finance', 'super_admin'];
const REVIEW_ACTIONS = new Set(['request_changes', 'reject', 'approve', 'trial_missed']);


export async function adminTransition(req: Request, deps: Deps) {
  const caller = await getCaller(req, deps);
  requireStaff(caller, ALL_STAFF);
  const input = await parseBody(req, adminTransitionSchema);
  const p = await loadPractitioner(deps, input.practitionerId);

  if (
    REVIEW_ACTIONS.has(input.action) &&
    p.assigned_reviewer_id &&
    p.assigned_reviewer_id !== caller.userId &&
    caller.staffRole !== 'super_admin'
  ) {
    throw new AppError('forbidden');
  }

  let trialCompleted = false;
  if (input.action === 'approve') {
    const { data: trial } = await deps.db
      .from('trial_calls')
      .select('status')
      .eq('practitioner_id', p.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    trialCompleted = trial?.status === 'completed';
  }

  const now = deps.now();
  const patch: Record<string, string | null> = {};
  if (input.action === 'claim') patch.assigned_reviewer_id = caller.userId;
  if (input.action === 'approve') patch.approved_at = now.toISOString();
  const reapplyAfter = new Date(now.getTime() + REAPPLY_WAIT_DAYS * 86_400_000);
  if (input.action === 'reject') patch.reapply_after = reapplyAfter.toISOString();

  const result = await transition(deps, {
    practitionerId: p.id,
    action: input.action,
    actor: { kind: 'staff', role: caller.staffRole },
    actorUserId: caller.userId,
    expectedStatus: input.expectedStatus,
    ctx: { reason: input.reason, trialCompleted },
    patch,
  });
  if (result.noop) return { status: result.status };

  const name = p.display_name ?? '';
  const reason = input.reason?.trim() ?? '';
  switch (input.action) {
    case 'request_changes':
      await notify(deps, p.user_id, 'application_changes_requested', { name, reason });
      break;
    case 'reject':
      await notify(deps, p.user_id, 'application_rejected', {
        name,
        reason,
        reapplyDate: formatIST(reapplyAfter).replace(/, \d+:\d+ [ap]m IST$/, ''),
      });
      break;
    case 'approve':
      await notify(deps, p.user_id, 'application_approved', { name });
      await deps.background(provisionLinkedAccount(deps, p.id));
      break;
    case 'suspend':
      await notify(deps, p.user_id, 'account_suspended', { name, reason });
      break;
  }
  return { status: result.status };
}
