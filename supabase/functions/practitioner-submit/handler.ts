import { AppError, applicationCompleteness, emptySchema } from '../_shared/core/index.ts';
import { getCaller } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';
import { notify } from '../_shared/notifications/notify.ts';
import { currentLegalVersions, loadSnapshot, practitionerForUser, transition } from '../_shared/practitioner.ts';

export async function practitionerSubmit(req: Request, deps: Deps) {
  const caller = await getCaller(req, deps);
  await parseBody(req, emptySchema);
  const p = await practitionerForUser(deps, caller.userId);
  if (p.status !== 'draft' && p.status !== 'changes_requested') throw new AppError('invalid_transition');
  const completeness = applicationCompleteness(await loadSnapshot(deps, p));
  const legal = await currentLegalVersions(deps);
  const agreementCurrent = !legal.practitioner_agreement || p.agreement_version === legal.practitioner_agreement;
  const result = await transition(deps, {
    practitionerId: p.id,
    action: 'submit',
    actor: { kind: 'practitioner' },
    actorUserId: caller.userId,
    expectedStatus: p.status,
    ctx: { applicationComplete: completeness.complete && agreementCurrent },
    patch: { submitted_at: deps.now().toISOString() },
    expectedUpdatedAt: p.updated_at,
  });
  if (!result.noop) await notify(deps, caller.userId, 'application_submitted', { name: p.display_name ?? '' });
  return { status: result.status };
}
