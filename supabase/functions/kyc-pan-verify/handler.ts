import { kycPanVerifySchema } from '../_shared/core/index.ts';
import { getCaller } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';
import { callProvider, editablePractitionerFor, recordResult, reserveAttempt, storeSecret } from '../_shared/kyc.ts';

export async function kycPanVerify(req: Request, deps: Deps) {
  const caller = await getCaller(req, deps);
  const { pan } = await parseBody(req, kycPanVerifySchema);
  const practitioner = await editablePractitionerFor(deps, caller.userId);
  const r = await reserveAttempt(deps, practitioner.id, 'pan');
  const result = await callProvider(deps, r, () => deps.verification.verifyPan(pan));
  if (result.valid) await storeSecret(deps, 'store_pan', { p_check_id: r.checkId, p_pan: pan });
  return recordResult(deps, r, practitioner.id, {
    valid: result.valid,
    verifiedName: result.registeredName,
    providerRef: result.ref,
  });
}
