import { ProviderError } from '../errors.ts';
import type { SmsProvider, WhatsAppProvider } from './types.ts';

type Env = (k: string) => string | undefined;

async function post(env: Env, url: string, body: unknown): Promise<{ providerRef: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { authkey: env('MSG91_AUTH_KEY') ?? '', 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.type === 'error' || json.status === 'fail') {
    throw new ProviderError(`msg91 ${res.status}: ${json.message ?? json.errors ?? 'request failed'}`);
  }
  return { providerRef: String(json.request_id ?? json.message ?? '') };
}

/** MSG91 Flow API with DLT-registered templates (OTP + transactional). */
export class Msg91Sms implements SmsProvider {
  constructor(private readonly env: Env) {}
  sendOtp(phoneE164: string, otp: string) {
    return post(this.env, 'https://control.msg91.com/api/v5/flow', {
      template_id: this.env('MSG91_TEMPLATE_OTP'),
      short_url: '0',
      recipients: [{ mobiles: phoneE164.replace('+', ''), otp }],
    });
  }
  sendTemplate(phoneE164: string, templateId: string, vars: Record<string, string>) {
    return post(this.env, 'https://control.msg91.com/api/v5/flow', {
      template_id: templateId,
      short_url: '0',
      recipients: [{ mobiles: phoneE164.replace('+', ''), ...vars }],
    });
  }
}

/** MSG91 WhatsApp outbound template message (Meta-approved templates named after the template key). */
export class Msg91WhatsApp implements WhatsAppProvider {
  constructor(private readonly env: Env) {}
  send(phoneE164: string, template: string, vars: Record<string, string>) {
    const components = Object.fromEntries(
      Object.values(vars).map((value, i) => [`body_${i + 1}`, { type: 'text', value }]),
    );
    return post(this.env, 'https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/', {
      integrated_number: this.env('MSG91_WHATSAPP_NUMBER'),
      content_type: 'template',
      payload: {
        messaging_product: 'whatsapp',
        type: 'template',
        template: {
          name: template,
          language: { code: 'en', policy: 'deterministic' },
          to_and_components: [{ to: [phoneE164.replace('+', '')], components }],
        },
      },
    });
  }
}
