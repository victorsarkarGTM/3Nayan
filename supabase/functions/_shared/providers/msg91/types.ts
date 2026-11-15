export interface SmsProvider {
  sendOtp(phoneE164: string, otp: string): Promise<{ providerRef: string }>;
  sendTemplate(phoneE164: string, templateId: string, vars: Record<string, string>): Promise<{ providerRef: string }>;
}

export interface WhatsAppProvider {
  send(phoneE164: string, template: string, vars: Record<string, string>): Promise<{ providerRef: string }>;
}
