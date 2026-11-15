import { ProviderError } from '../errors.ts';
import type { SmsProvider } from './types.ts';

type Env = (k: string) => string | undefined;

/** MSG91 Flow API (DLT-registered template). */
export class Msg91Sms implements SmsProvider {
  constructor(private readonly env: Env) {}
  async sendOtp(phoneE164: string, otp: string) {
    const res = await fetch('https://control.msg91.com/api/v5/flow', {
      method: 'POST',
      headers: { authkey: this.env('MSG91_AUTH_KEY') ?? '', 'content-type': 'application/json' },
      body: JSON.stringify({
        template_id: this.env('MSG91_TEMPLATE_OTP'),
        short_url: '0',
        recipients: [{ mobiles: phoneE164.replace('+', ''), otp }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.type === 'error') throw new ProviderError(`msg91 sms failed: ${res.status} ${body.message ?? ''}`);
    return { providerRef: String(body.message ?? '') };
  }
}
