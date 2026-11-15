import { ProviderError } from '../errors.ts';
import { DuplicateReferenceError, type AccountStatus, type LinkedAccountInput, type RazorpayProvider } from './types.ts';

type FakeAccount = {
  id: string;
  input: LinkedAccountInput;
  stakeholder?: { name: string; email: string; pan: string };
  productId?: string;
  settlement?: { accountNumber: string; ifsc: string; beneficiaryName: string };
};

export class FakeRazorpay implements RazorpayProvider {
  readonly accounts = new Map<string, FakeAccount>();
  failNext = 0;
  statusOverride: AccountStatus | null = null;

  private maybeFail() {
    if (this.failNext > 0) {
      this.failNext--;
      throw new ProviderError('fake razorpay outage');
    }
  }
  private byId(id: string): FakeAccount {
    const a = [...this.accounts.values()].find((x) => x.id === id);
    if (!a) throw new ProviderError(`no account ${id}`);
    return a;
  }
  async createLinkedAccount(input: LinkedAccountInput) {
    this.maybeFail();
    if (this.accounts.has(input.referenceId)) throw new DuplicateReferenceError(input.referenceId);
    const id = `acc_fake${this.accounts.size + 1}`;
    this.accounts.set(input.referenceId, { id, input });
    return { accountId: id };
  }
  async findAccountByReference(referenceId: string) {
    return this.accounts.get(referenceId)?.id ?? null;
  }
  async addStakeholder(accountId: string, input: { name: string; email: string; pan: string }) {
    this.byId(accountId).stakeholder = input;
  }
  async requestRouteProduct(accountId: string) {
    const a = this.byId(accountId);
    a.productId = a.productId ?? `acc_prd_${accountId}`;
    return { productId: a.productId };
  }
  async configureSettlement(accountId: string, _productId: string, s: { accountNumber: string; ifsc: string; beneficiaryName: string }) {
    this.byId(accountId).settlement = s;
  }
  async getAccountStatus(_accountId: string): Promise<AccountStatus> {
    return this.statusOverride ?? 'created';
  }
}
