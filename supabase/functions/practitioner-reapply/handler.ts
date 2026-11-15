import { emptySchema } from '../_shared/core/index.ts';
import { getCaller } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';
import { practitionerForUser, transition } from '../_shared/practitioner.ts';

/** After the 30-day wait, a rejected applicant returns to draft with their previous answers kept. */
export async function practitionerReapply(req: Request, deps: Deps) {
  const caller = await getCaller(req, deps);
  await parseBody(req, emptySchema);
  const p = await practitionerForUser(deps, caller.userId);
  const result = await transition(deps, {
    practitionerId: p.id,
    action: 'reapply',
    actor: { kind: 'practitioner' },
    actorUserId: caller.userId,
    expectedStatus: p.status,
    ctx: { reapplyAfter: p.reapply_after ? new Date(p.reapply_after) : null },
  });
  // The agreement must be accepted again on the new application.
  const { error } = await deps.db
    .from('practitioners')
    .update({ declaration_accepted: false, agreement_version: null })
    .eq('id', p.id);
  if (error) throw new Error(error.message);
  return { status: result.status };
}
