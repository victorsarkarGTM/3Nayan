import type { Deps } from '../_shared/deps.ts';
import { recordCheck } from '../_shared/kyc.ts';
import { ProviderError } from '../_shared/providers/errors.ts';

function appRedirect(deps: Deps, state: string | null, outcome: 'done' | 'error'): Response {
  const target =
    state === 'mobile'
      ? `threenayan://apply/5?kyc=${outcome}`
      : `${deps.env('APP_URL') ?? ''}/practitioner/apply/5?kyc=${outcome}`;
  return new Response(null, { status: 302, headers: { location: target } });
}

/**
 * DigiLocker redirect target (GET from the provider). Completion is fetched from the provider by
 * verification id, so a forged callback can't inject a result. Only the last 4 Aadhaar digits are stored.
 */
export async function handleDigilockerCallback(req: Request, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  const verificationId = url.searchParams.get('verification_id');
  const state = url.searchParams.get('state');
  if (!verificationId) return appRedirect(deps, state, 'error');
  const { data: row } = await deps.db
    .from('verification_checks')
    .select('id,kind,status,verified_name,attempts,attempt_times,practitioner_id')
    .eq('kind', 'aadhaar')
    .eq('provider_ref', verificationId)
    .maybeSingle();
  if (!row) return appRedirect(deps, state, 'error');
  try {
    const r = await deps.verification.completeDigilocker(verificationId);
    await recordCheck(deps, row, row.practitioner_id, {
      valid: Boolean(r.name && r.aadhaarLast4.length === 4),
      verifiedName: r.name,
      providerRef: r.ref,
      extra: { masked_ref: `XXXX XXXX ${r.aadhaarLast4}`, year_of_birth: r.yearOfBirth || null },
    });
    return appRedirect(deps, state, 'done');
  } catch (e) {
    console.error('digilocker completion failed', e instanceof ProviderError ? e.message : e);
    await deps.db.from('verification_checks').update({ last_error: 'digilocker completion failed' }).eq('id', row.id);
    return appRedirect(deps, state, 'error');
  }
}
