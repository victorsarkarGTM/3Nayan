import type { SmsProvider } from './types.ts';

export class FakeSms implements SmsProvider {
  readonly outbox: Array<{ phone: string; otp: string }> = [];
  async sendOtp(phone: string, otp: string) {
    this.outbox.push({ phone, otp });
    return { providerRef: `fake-sms-${this.outbox.length}` };
  }
}
