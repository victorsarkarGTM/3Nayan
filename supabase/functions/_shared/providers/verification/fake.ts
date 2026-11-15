import { ProviderError } from '../errors.ts';
import type { VerificationProvider } from './types.ts';

/**
 * Deterministic fake for local/CI:
 * PAN ABCDE1234F → valid "RAHUL KUMAR SHARMA"; ZZZZZ9999Z → provider outage; any other PAN → invalid.
 * Bank 000000000000 → invalid; accounts starting 99 → holder "PRIYA NAIR"; others → "RAHUL K SHARMA".
 * DigiLocker → "Rahul Kumar Sharma", born 1990, Aadhaar ending 1234.
 */
export class FakeVerification implements VerificationProvider {
  async verifyPan(pan: string) {
    if (pan === 'ZZZZZ9999Z') throw new ProviderError('fake PAN service outage');
    if (pan === 'ABCDE1234F') return { valid: true, registeredName: 'RAHUL KUMAR SHARMA', ref: `fake-pan-${pan}` };
    return { valid: false, registeredName: '', ref: `fake-pan-${pan}` };
  }
  async startDigilocker(redirectUrl: string) {
    const verificationId = `fake-dl-${crypto.randomUUID()}`;
    const url = new URL(redirectUrl);
    url.searchParams.set('verification_id', verificationId);
    return { url: url.toString(), verificationId };
  }
  async completeDigilocker(verificationId: string) {
    return { name: 'Rahul Kumar Sharma', yearOfBirth: 1990, aadhaarLast4: '1234', ref: verificationId };
  }
  async verifyBank(account: string, _ifsc: string) {
    if (account === '000000000000') return { valid: false, holderName: '', ref: 'fake-bank-invalid' };
    const holderName = account.startsWith('99') ? 'PRIYA NAIR' : 'RAHUL K SHARMA';
    return { valid: true, holderName, ref: `fake-bank-${account.slice(-4)}` };
  }
}
