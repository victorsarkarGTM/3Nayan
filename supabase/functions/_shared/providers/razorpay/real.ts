import { ProviderError } from '../errors.ts';
import { DuplicateReferenceError, type AccountStatus, type LinkedAccountInput, type RazorpayProvider } from './types.ts';

type Env = (k: string) => string | undefined;

/** Razorpay Route linked accounts (v2 Accounts API). */
export class RazorpayRoute implements RazorpayProvider {
  constructor(private readonly env: Env) {}

  private async call(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
    const auth = btoa(`${this.env('RAZORPAY_KEY_ID')}:${this.env('RAZORPAY_KEY_SECRET')}`);
    let res: Response;
    try {
      res = await fetch(`https://api.razorpay.com${path}`, {
        method,
        headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new ProviderError(`razorpay unreachable: ${(e as Error).message}`);
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { description?: string } };
    if (!res.ok) {
      const description = json.error?.description ?? `status ${res.status}`;
      if (/reference_id/i.test(description) && /already/i.test(description)) {
        throw new DuplicateReferenceError(String((body as { reference_id?: string })?.reference_id ?? ''));
      }
      throw new ProviderError(`razorpay ${method} ${path}: ${description}`);
    }
    return json;
  }

  async createLinkedAccount(i: LinkedAccountInput) {
    const json = await this.call('POST', '/v2/accounts', {
      email: i.email,
      phone: i.phone.replace(/^\+91/, ''),
      type: 'route',
      reference_id: i.referenceId,
      legal_business_name: i.legalName,
      business_type: 'individual',
      contact_name: i.legalName,
      profile: {
        category: this.env('RAZORPAY_PROFILE_CATEGORY'),
        subcategory: this.env('RAZORPAY_PROFILE_SUBCATEGORY'),
        addresses: {
          registered: {
            street1: i.address.street1,
            street2: i.address.street2 || i.address.city,
            city: i.address.city,
            state: i.address.state.toUpperCase(),
            postal_code: i.address.pincode,
            country: 'IN',
          },
        },
      },
      legal_info: { pan: i.pan },
    });
    return { accountId: String(json.id) };
  }

  /** The Accounts API has no lookup by reference id; duplicates are linked by finance from the dashboard. */
  async findAccountByReference(_referenceId: string) {
    return null;
  }

  async addStakeholder(accountId: string, s: { name: string; email: string; pan: string }) {
    await this.call('POST', `/v2/accounts/${accountId}/stakeholders`, { name: s.name, email: s.email, kyc: { pan: s.pan } });
  }

  async requestRouteProduct(accountId: string) {
    const json = await this.call('POST', `/v2/accounts/${accountId}/products`, { product_name: 'route', tnc_accepted: true });
    return { productId: String(json.id) };
  }

  async configureSettlement(accountId: string, productId: string, s: { accountNumber: string; ifsc: string; beneficiaryName: string }) {
    await this.call('PATCH', `/v2/accounts/${accountId}/products/${productId}`, {
      settlements: { account_number: s.accountNumber, ifsc_code: s.ifsc, beneficiary_name: s.beneficiaryName },
      tnc_accepted: true,
    });
  }

  async getAccountStatus(accountId: string) {
    const json = await this.call('GET', `/v2/accounts/${accountId}`);
    return String(json.status) as AccountStatus;
  }
}
