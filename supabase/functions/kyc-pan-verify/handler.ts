import { kycPanVerifySchema } from '../_shared/core/index.ts';
import { getCaller } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';
import { assertAttemptsAvailable, callProvider, editablePractitionerFor, recordCheck } from '../_shared/kyc.ts';

export async function kycPanVerify(req: Request, deps: Deps) {
  const caller = await getCaller(req, deps);
  const { pan } = await parseBody(req, kycPanVerifySchema);
  const practitioner = await editablePractitionerFor(deps, caller.userId);
  const row = await assertAttemptsAvailable(deps, practitioner.id, 'pan');
  const result = await callProvider(() => deps.verification.verifyPan(pan));
  if (result.valid) {
    const { error } = await deps.db.rpc('store_pan', { p_check_id: row.id, p_pan: pan });
    if (error) throw new Error(error.message);
  }
  return recordCheck(deps, row, practitioner.id, {
    valid: result.valid,
    verifiedName: result.registeredName,
    providerRef: result.ref,
  });
}
