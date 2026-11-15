import { ProviderError } from '../errors.ts';
import type { VerificationProvider } from './types.ts';

type Env = (k: string) => string | undefined;

/**
 * Cashfree Secure ID (Verification Suite). Base URL: CASHFREE_BASE_URL
 * (sandbox: https://sandbox.cashfree.com/verification, production: https://api.cashfree.com/verification).
 * Endpoint shapes follow Cashfree's Secure ID API reference; confirm against current docs when
 * switching staging to real credentials.
 */
export class CashfreeVerification implements VerificationProvider {
  constructor(private readonly env: Env) {}

  // Provider JSON is untyped; each method reads only the fields it needs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
    let res: Response;
    try {
      res = await fetch(`${this.env('CASHFREE_BASE_URL')}${path}`, {
        method,
        headers: {
          'x-client-id': this.env('CASHFREE_CLIENT_ID') ?? '',
          'x-client-secret': this.env('CASHFREE_CLIENT_SECRET') ?? '',
          'content-type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new ProviderError(`cashfree unreachable: ${(e as Error).message}`);
    }
    const json = await res.json().catch(() => ({}));
    // 4xx with a body = a completed check that says "invalid"; 5xx/429 = outage.
    if (res.status >= 500 || res.status === 429 || res.status === 401 || res.status === 403) {
      throw new ProviderError(`cashfree ${res.status}: ${json.message ?? 'error'}`);
    }
    return { status: res.status, json };
  }

  async verifyPan(pan: string) {
    const { json } = await this.call('POST', '/pan', { pan });
    return { valid: json.valid === true, registeredName: String(json.registered_name ?? ''), ref: String(json.reference_id ?? '') };
  }

  async startDigilocker(redirectUrl: string) {
    const verificationId = crypto.randomUUID();
    const { json } = await this.call('POST', '/digilocker', {
      verification_id: verificationId,
      document_requested: ['AADHAAR'],
      redirect_url: redirectUrl,
    });
    if (!json.url) throw new ProviderError('cashfree digilocker: no url returned');
    return { url: String(json.url), verificationId };
  }

  async completeDigilocker(verificationId: string) {
    const { json: status } = await this.call('GET', `/digilocker?verification_id=${encodeURIComponent(verificationId)}`);
    if (status.status !== 'AUTHENTICATED') throw new ProviderError(`digilocker not authenticated: ${status.status}`);
    const { json } = await this.call(
      'GET',
      `/digilocker/document/AADHAAR?verification_id=${encodeURIComponent(verificationId)}`,
    );
    const uid = String(json.uid ?? json.masked_aadhaar ?? '');
    const dob = String(json.dob ?? json.year_of_birth ?? '');
    return {
      name: String(json.name ?? ''),
      yearOfBirth: Number(dob.match(/(\d{4})/)?.[1] ?? 0),
      aadhaarLast4: uid.replace(/\D/g, '').slice(-4),
      ref: String(json.reference_id ?? verificationId),
    };
  }

  async verifyBank(account: string, ifsc: string) {
    const { json } = await this.call('POST', '/bank-account/sync', { bank_account: account, ifsc });
    return {
      valid: json.account_status === 'VALID',
      holderName: String(json.name_at_bank ?? ''),
      ref: String(json.reference_id ?? ''),
    };
  }
}
