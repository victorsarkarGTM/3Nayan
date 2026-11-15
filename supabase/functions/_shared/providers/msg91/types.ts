export interface SmsProvider {
  sendOtp(phoneE164: string, otp: string): Promise<{ providerRef: string }>;
}
