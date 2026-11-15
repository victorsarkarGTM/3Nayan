import { AppError, kycDigilockerStartSchema } from '../_shared/core/index.ts';
import { getCaller } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';
import { assertAttemptsAvailable, editablePractitionerFor } from '../_shared/kyc.ts';
import { ProviderError } from '../_shared/providers/errors.ts';

/** Starts Aadhaar verification via DigiLocker consent; the provider redirects to our callback. */
export async function kycDigilockerStart(req: Request, deps: Deps) {
  const caller = await getCaller(req, deps);
  const { platform } = await parseBody(req, kycDigilockerStartSchema);
  const practitioner = await editablePractitionerFor(deps, caller.userId);
  await assertAttemptsAvailable(deps, practitioner.id, 'aadhaar');
  const functionsUrl = deps.env('SUPABASE_FUNCTIONS_URL') ?? `${deps.env('SUPABASE_URL')}/functions/v1`;
  const callback = `${functionsUrl}/kyc-digilocker-callback?state=${platform}`;
  let started: { url: string; verificationId: string };
  try {
    started = await deps.verification.startDigilocker(callback);
  } catch (e) {
    if (e instanceof ProviderError) throw new AppError('provider_unavailable');
    throw e;
  }
  // The session id is single-use: the callback claims (and clears) it. Existing results are untouched.
  const { error } = await deps.db
    .from('verification_checks')
    .upsert(
      { practitioner_id: practitioner.id, kind: 'aadhaar', pending_verification_id: started.verificationId },
      { onConflict: 'practitioner_id,kind' },
    );
  if (error) throw new Error(error.message);
  return { url: started.url };
}
