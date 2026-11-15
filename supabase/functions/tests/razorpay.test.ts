import { describe, expect, it } from 'vitest';
import { provisionLinkedAccount, syncLinkedAccounts } from '../_shared/linked-account.ts';
import { razorpayLinkedAccountRetry } from '../razorpay-linked-account-retry/handler.ts';
import { FakeRazorpay } from '../_shared/providers/razorpay/fake.ts';
import { createApplicant, createStaff, fillApplication, invoke, serviceClient, setPractitionerStatus, testDeps } from './helpers.ts';

async function approvedWithKyc() {
  const a = await createApplicant();
  await fillApplication(a.practitionerId, a.userId);
  const db = serviceClient();
  const { data: checks } = await db.from('verification_checks').select('id,kind').eq('practitioner_id', a.practitionerId);
  const id = (k: string) => checks!.find((c: { kind: string }) => c.kind === k)!.id;
  await db.rpc('store_pan', { p_check_id: id('pan'), p_pan: 'ABCDE1234F' });
  await db.rpc('store_bank_account', { p_check_id: id('bank'), p_account: '123456783210', p_ifsc: 'HDFC0001234' });
  await setPractitionerStatus(a.practitionerId, 'approved');
  return a;
}
const row = async (id: string) =>
  (await serviceClient().from('practitioners').select('status,razorpay_account_id,razorpay_account_status').eq('id', id).single()).data!;
const openAttention = async (id: string) =>
  (await serviceClient().from('attention_items').select('id,kind,status').eq('target_id', id).eq('status', 'open')).data ?? [];
const noSleep = { sleep: async () => {} };

describe('Razorpay linked account', () => {
  it("approve → fake razorpay account stored with status 'created'", async () => {
    const a = await approvedWithKyc();
    const rzp = new FakeRazorpay();
    await provisionLinkedAccount(testDeps({}, { razorpay: rzp, ...noSleep }), a.practitionerId);
    expect(await row(a.practitionerId)).toMatchObject({ razorpay_account_status: 'created' });
    const acct = rzp.accounts.get(a.practitionerId.replace(/-/g, '').slice(0, 20))!;
    expect(acct.input).toMatchObject({ pan: 'ABCDE1234F', email: 'rahul@example.com', legalName: 'RAHUL SHARMA' });
    expect(acct.settlement).toMatchObject({ accountNumber: '123456783210', ifsc: 'HDFC0001234' });
  });

  it('provider fails 5 times → attention item linked_account_failed, practitioner still approved', async () => {
    const a = await approvedWithKyc();
    const rzp = new FakeRazorpay();
    rzp.failNext = 5;
    const sleeps: number[] = [];
    await provisionLinkedAccount(testDeps({}, { razorpay: rzp, sleep: async (ms) => void sleeps.push(ms) }), a.practitionerId);
    expect(sleeps).toEqual([1000, 2000, 4000, 8000]);
    expect((await row(a.practitionerId)).status).toBe('approved');
    expect((await openAttention(a.practitionerId)).map((x) => x.kind)).toEqual(['linked_account_failed']);
  });

  it('retry after fix resolves attention item', async () => {
    const a = await approvedWithKyc();
    const rzp = new FakeRazorpay();
    rzp.failNext = 5;
    await provisionLinkedAccount(testDeps({}, { razorpay: rzp, ...noSleep }), a.practitionerId);
    const fin = await createStaff('finance');
    const r = await invoke(razorpayLinkedAccountRetry, { practitionerId: a.practitionerId }, { token: fin.token, deps: testDeps({}, { razorpay: rzp, ...noSleep }) });
    expect(r.status).toBe(200);
    expect(await openAttention(a.practitionerId)).toEqual([]);
    expect((await row(a.practitionerId)).razorpay_account_id).toBeTruthy();
  });

  it('reviewer cannot retry → 403', async () => {
    const a = await approvedWithKyc();
    const rev = await createStaff('reviewer');
    const r = await invoke(razorpayLinkedAccountRetry, { practitionerId: a.practitionerId }, { token: rev.token });
    expect(r.status).toBe(403);
  });

  it('duplicate reference → reuses existing account id', async () => {
    const a = await approvedWithKyc();
    const rzp = new FakeRazorpay();
    const deps = testDeps({}, { razorpay: rzp, ...noSleep });
    await provisionLinkedAccount(deps, a.practitionerId);
    const first = (await row(a.practitionerId)).razorpay_account_id;
    await serviceClient().from('practitioners').update({ razorpay_account_id: null }).eq('id', a.practitionerId);
    await provisionLinkedAccount(deps, a.practitionerId);
    expect((await row(a.practitionerId)).razorpay_account_id).toBe(first);
    expect(rzp.accounts.size).toBe(1);
  });

  it('sync updates non-activated accounts', async () => {
    const a = await approvedWithKyc();
    const rzp = new FakeRazorpay();
    const deps = testDeps({}, { razorpay: rzp, ...noSleep });
    await provisionLinkedAccount(deps, a.practitionerId);
    rzp.statusOverride = 'activated';
    await syncLinkedAccounts(deps);
    expect((await row(a.practitionerId)).razorpay_account_status).toBe('activated');
  });
});
