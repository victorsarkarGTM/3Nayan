import { ProviderError } from '../errors.ts';
import type { SmsProvider, WhatsAppProvider } from './types.ts';

export class FakeSms implements SmsProvider {
  readonly outbox: Array<{ phone: string; otp: string }> = [];
  readonly messages: Array<{ phone: string; templateId: string; vars: Record<string, string> }> = [];
  failWith: string | null = null;
  async sendOtp(phone: string, otp: string) {
    this.outbox.push({ phone, otp });
    return { providerRef: `fake-otp-${this.outbox.length}` };
  }
  async sendTemplate(phone: string, templateId: string, vars: Record<string, string>) {
    if (this.failWith) throw new ProviderError(this.failWith);
    this.messages.push({ phone, templateId, vars });
    return { providerRef: `fake-sms-${this.messages.length}` };
  }
}

export class FakeWhatsApp implements WhatsAppProvider {
  readonly sent: Array<{ phone: string; template: string; vars: Record<string, string> }> = [];
  failWith: string | null = null;
  async send(phone: string, template: string, vars: Record<string, string>) {
    if (this.failWith) throw new ProviderError(this.failWith);
    this.sent.push({ phone, template, vars });
    return { providerRef: `fake-wa-${this.sent.length}` };
  }
}
