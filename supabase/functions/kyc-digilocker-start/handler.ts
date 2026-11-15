import { kycDigilockerStartSchema } from '../_shared/core/index.ts';
import { getCaller } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';
import { assertAttemptsAvailable, callProvider, editablePractitionerFor } from '../_shared/kyc.ts';

/** Starts Aadhaar verification via DigiLocker consent; the provider redirects to our callback. */
export async function kycDigilockerStart(req: Request, deps: Deps) {
  const caller = await getCaller(req, deps);
  const { platform } = await parseBody(req, kycDigilockerStartSchema);
  const practitioner = await editablePractitionerFor(deps, caller.userId);
  const row = await assertAttemptsAvailable(deps, practitioner.id, 'aadhaar');
  const functionsUrl = deps.env('SUPABASE_FUNCTIONS_URL') ?? `${deps.env('SUPABASE_URL')}/functions/v1`;
  const callback = `${functionsUrl}/kyc-digilocker-callback?state=${platform}`;
  const { url, verificationId } = await callProvider(() => deps.verification.startDigilocker(callback));
  const { error } = await deps.db
    .from('verification_checks')
    .update({ provider_ref: verificationId, status: row.status === 'passed' ? row.status : 'pending' })
    .eq('id', row.id);
  if (error) throw new Error(error.message);
  return { url };
}
