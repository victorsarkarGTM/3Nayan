export interface VerificationProvider {
  verifyPan(pan: string): Promise<{ valid: boolean; registeredName: string; ref: string }>;
  startDigilocker(redirectUrl: string): Promise<{ url: string; verificationId: string }>;
  completeDigilocker(verificationId: string): Promise<{ name: string; yearOfBirth: number; aadhaarLast4: string; ref: string }>;
  verifyBank(account: string, ifsc: string): Promise<{ valid: boolean; holderName: string; ref: string }>;
}
