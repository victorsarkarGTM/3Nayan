import { AppError, practitionerIdSchema } from '../_shared/core/index.ts';
import { audit } from '../_shared/audit.ts';
import { getCaller, requireStaff } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';
import { provisionLinkedAccount } from '../_shared/linked-account.ts';
import { loadPractitioner } from '../_shared/practitioner.ts';

export async function razorpayLinkedAccountRetry(req: Request, deps: Deps) {
  const caller = await getCaller(req, deps);
  requireStaff(caller, ['finance', 'super_admin']);
  const { practitionerId } = await parseBody(req, practitionerIdSchema);
  const p = await loadPractitioner(deps, practitionerId);
  if (p.status !== 'approved') throw new AppError('invalid_transition');
  await audit(deps, { actorId: caller.userId, actorKind: 'staff', action: 'linked_account.retry', targetTable: 'practitioners', targetId: p.id });
  const ok = await provisionLinkedAccount(deps, p.id);
  return { ok };
}
