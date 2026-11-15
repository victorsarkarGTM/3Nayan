import type { ResidentialAddress } from '../../core/index.ts';

export type LinkedAccountInput = {
  email: string;
  phone: string;
  legalName: string;
  pan: string;
  address: ResidentialAddress;
  referenceId: string;
};
export type AccountStatus = 'created' | 'activated' | 'needs_clarification' | 'suspended' | 'under_review';

export interface RazorpayProvider {
  createLinkedAccount(input: LinkedAccountInput): Promise<{ accountId: string }>;
  /** Existing account for a reference id, or null when the API can't look it up. */
  findAccountByReference(referenceId: string): Promise<string | null>;
  addStakeholder(accountId: string, input: { name: string; email: string; pan: string }): Promise<void>;
  requestRouteProduct(accountId: string): Promise<{ productId: string }>;
  configureSettlement(
    accountId: string,
    productId: string,
    s: { accountNumber: string; ifsc: string; beneficiaryName: string },
  ): Promise<void>;
  getAccountStatus(accountId: string): Promise<AccountStatus>;
}

export class DuplicateReferenceError extends Error {
  constructor(readonly referenceId: string) {
    super(`linked account with reference ${referenceId} already exists`);
    this.name = 'DuplicateReferenceError';
  }
}
