import { kycBankVerifySchema } from '../_shared/core/index.ts';
import { getCaller } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';
import { callProvider, editablePractitionerFor, recordResult, reserveAttempt, storeSecret } from '../_shared/kyc.ts';

export async function kycBankVerify(req: Request, deps: Deps) {
  const caller = await getCaller(req, deps);
  const { accountNumber, ifsc } = await parseBody(req, kycBankVerifySchema);
  const practitioner = await editablePractitionerFor(deps, caller.userId);
  const r = await reserveAttempt(deps, practitioner.id, 'bank');
  const result = await callProvider(deps, r, () => deps.verification.verifyBank(accountNumber, ifsc));
  if (result.valid) {
    await storeSecret(deps, 'store_bank_account', { p_check_id: r.checkId, p_account: accountNumber, p_ifsc: ifsc });
  }
  return recordResult(deps, r, practitioner.id, {
    valid: result.valid,
    verifiedName: result.holderName,
    providerRef: result.ref,
  });
}
