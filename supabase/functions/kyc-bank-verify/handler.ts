import { kycBankVerifySchema } from '../_shared/core/index.ts';
import { getCaller } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';
import { assertAttemptsAvailable, callProvider, editablePractitionerFor, recordCheck } from '../_shared/kyc.ts';

export async function kycBankVerify(req: Request, deps: Deps) {
  const caller = await getCaller(req, deps);
  const { accountNumber, ifsc } = await parseBody(req, kycBankVerifySchema);
  const practitioner = await editablePractitionerFor(deps, caller.userId);
  const row = await assertAttemptsAvailable(deps, practitioner.id, 'bank');
  const result = await callProvider(() => deps.verification.verifyBank(accountNumber, ifsc));
  if (result.valid) {
    const { error } = await deps.db.rpc('store_bank_account', { p_check_id: row.id, p_account: accountNumber, p_ifsc: ifsc });
    if (error) throw new Error(error.message);
  }
  return recordCheck(deps, row, practitioner.id, {
    valid: result.valid,
    verifiedName: result.holderName,
    providerRef: result.ref,
  });
}
