import { AppError } from '../_shared/core/index.ts';
import type { Deps } from '../_shared/deps.ts';
import { recordResult, reserveAttempt } from '../_shared/kyc.ts';

function appRedirect(deps: Deps, state: string | null, outcome: 'done' | 'error'): Response {
  const target =
    state === 'mobile'
      ? `threenayan://apply/5?kyc=${outcome}`
      : `${deps.env('APP_URL') ?? ''}/practitioner/apply/5?kyc=${outcome}`;
  return new Response(null, { status: 302, headers: { location: target } });
}

/**
 * DigiLocker redirect target (GET from the provider). The verification id is claimed atomically, so
 * a replayed callback does nothing; the application must still be editable; the result is fetched
 * from the provider, so a forged callback can't inject data. Only the last 4 Aadhaar digits are kept.
 */
export async function handleDigilockerCallback(req: Request, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  const verificationId = url.searchParams.get('verification_id');
  const state = url.searchParams.get('state');
  if (!verificationId) return appRedirect(deps, state, 'error');
  const { data: claimed } = await deps.db
    .from('verification_checks')
    .update({ pending_verification_id: null })
    .eq('kind', 'aadhaar')
    .eq('pending_verification_id', verificationId)
    .select('practitioner_id');
  const practitionerId: string | undefined = claimed?.[0]?.practitioner_id;
  if (!practitionerId) return appRedirect(deps, state, 'error');
  try {
    const r = await reserveAttempt(deps, practitionerId, 'aadhaar');
    let completed;
    try {
      completed = await deps.verification.completeDigilocker(verificationId);
    } catch (e) {
      await deps.db.rpc('release_kyc_attempt', { p_check_id: r.checkId, p_at: r.at });
      throw e;
    }
    await recordResult(deps, r, practitionerId, {
      valid: Boolean(completed.name && completed.aadhaarLast4.length === 4),
      verifiedName: completed.name,
      providerRef: completed.ref,
      extra: { masked_ref: `XXXX XXXX ${completed.aadhaarLast4}`, year_of_birth: completed.yearOfBirth || null },
    });
    return appRedirect(deps, state, 'done');
  } catch (e) {
    if (!(e instanceof AppError)) console.error('digilocker completion failed', e instanceof Error ? e.message : e);
    return appRedirect(deps, state, 'error');
  }
}
