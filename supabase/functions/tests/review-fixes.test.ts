import { describe, expect, it } from 'vitest';
import { Webhook } from 'standardwebhooks';
import { adminTransition } from '../admin-transition/handler.ts';
import { handleSendSms } from '../auth-send-sms/handler.ts';
import { jobs } from '../jobs/handler.ts';
import { kycBankVerify } from '../kyc-bank-verify/handler.ts';
import { handleDigilockerCallback } from '../kyc-digilocker-callback/handler.ts';
import { kycDigilockerStart } from '../kyc-digilocker-start/handler.ts';
import { kycPanVerify } from '../kyc-pan-verify/handler.ts';
import { practitionerSubmit } from '../practitioner-submit/handler.ts';
import { trialJoinToken } from '../trial-join-token/handler.ts';
import { trialOutcome } from '../trial-outcome/handler.ts';
import { trialPropose } from '../trial-propose/handler.ts';
import { trialSelect } from '../trial-select/handler.ts';
import { provisionLinkedAccount } from '../_shared/linked-account.ts';
import type { FakeSms } from '../_shared/providers/msg91/fake.ts';
import { FakeRazorpay } from '../_shared/providers/razorpay/fake.ts';
import { FakeVerification } from '../_shared/providers/verification/fake.ts';
import {
  createApplicant,
  createStaff,
  fillApplication,
  invoke,
  serviceClient,
  setPractitionerStatus,
  testDeps,
} from './helpers.ts';

const H = 3600_000;
const check = async (pid: string, kind: string) =>
  (await serviceClient().from('verification_checks').select('*').eq('practitioner_id', pid).eq('kind', kind).maybeSingle()).data;

describe('I1: KYC attempt limit under concurrency', () => {
  it('5 concurrent PAN checks → exactly 3 run, 2 refused, attempts = 3', async () => {
    const a = await createApplicant();
    const results = await Promise.all(Array.from({ length: 5 }, () => invoke(kycPanVerify, { pan: 'AAAAA1111A' }, { token: a.token })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    expect(results.filter((r) => r.body.error?.code === 'kyc_attempts_exhausted')).toHaveLength(2);
    expect((await check(a.practitionerId, 'pan'))?.attempts).toBe(3);
  });
});

describe('I2: KYC writes after submission', () => {
  it('bank result arriving after submit is refused and nothing is stored', async () => {
    const a = await createApplicant();
    const slow = new (class extends FakeVerification {
      override async verifyBank(account: string, ifsc: string) {
        await setPractitionerStatus(a.practitionerId, 'submitted');
        return super.verifyBank(account, ifsc);
      }
    })();
    const r = await invoke(kycBankVerify, { accountNumber: '123456783210', ifsc: 'HDFC0001234' }, { token: a.token, deps: testDeps({}, { verification: slow }) });
    expect(r.status).toBe(400);
    expect(r.body.error?.code).toBe('invalid_transition');
    const bank = await check(a.practitionerId, 'bank');
    expect(bank?.masked_ref ?? null).toBeNull();
    expect(bank?.verified_name ?? null).toBeNull();
  });

  it('DigiLocker callback after submit changes nothing; a replay does not consume attempts', async () => {
    const a = await createApplicant();
    const deps = testDeps({ APP_URL: 'http://localhost:3000' });
    const start = await invoke(kycDigilockerStart, { platform: 'web' }, { token: a.token, deps });
    const vid = new URL(start.body.data.url).searchParams.get('verification_id');
    const cb = () => handleDigilockerCallback(new Request(`http://local/cb?verification_id=${vid}&state=web`), deps);
    expect((await cb()).headers.get('location')).toContain('kyc=done');
    const attempts = (await check(a.practitionerId, 'aadhaar'))?.attempts;
    expect((await cb()).headers.get('location')).toContain('kyc=error');
    expect((await check(a.practitionerId, 'aadhaar'))?.attempts).toBe(attempts);

    const start2 = await invoke(kycDigilockerStart, { platform: 'web' }, { token: a.token, deps });
    const vid2 = new URL(start2.body.data.url).searchParams.get('verification_id');
    await setPractitionerStatus(a.practitionerId, 'submitted');
    const before = await check(a.practitionerId, 'aadhaar');
    const res = await handleDigilockerCallback(new Request(`http://local/cb?verification_id=${vid2}&state=web`), deps);
    expect(res.headers.get('location')).toContain('kyc=error');
    expect(await check(a.practitionerId, 'aadhaar')).toMatchObject({ attempts: before!.attempts, checked_at: before!.checked_at });
  });
});

async function inReview() {
  const a = await createApplicant();
  await fillApplication(a.practitionerId, a.userId);
  await invoke(practitionerSubmit, {}, { token: a.token });
  const rev = await createStaff('reviewer');
  await invoke(adminTransition, { practitionerId: a.practitionerId, action: 'claim', expectedStatus: 'submitted' }, { token: rev.token });
  return { a, rev };
}
const slots = (base = Date.now()) => [30, 50, 70].map((h) => new Date(base + h * H).toISOString());
const trialKeyCount = async (userId: string) =>
  (await serviceClient().from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('template_key', 'trial_proposed')).count;

describe('I4: duplicate trial proposals', () => {
  it('concurrent identical proposals → one trial, one notification batch', async () => {
    const { a, rev } = await inReview();
    const s = slots();
    const rs = await Promise.all([1, 2].map(() => invoke(trialPropose, { practitionerId: a.practitionerId, slots: s }, { token: rev.token })));
    expect(rs.some((r) => r.status === 200)).toBe(true);
    const { data } = await serviceClient().from('trial_calls').select('id').eq('practitioner_id', a.practitionerId).in('status', ['proposed', 'scheduled']);
    expect(data).toHaveLength(1);
    expect(await trialKeyCount(a.userId)).toBe(2); // sms + whatsapp, once
  });

  it('repeating an identical proposal is a no-op returning the same trial', async () => {
    const { a, rev } = await inReview();
    const s = slots();
    const r1 = await invoke(trialPropose, { practitionerId: a.practitionerId, slots: s }, { token: rev.token });
    const r2 = await invoke(trialPropose, { practitionerId: a.practitionerId, slots: s }, { token: rev.token });
    expect(r2.body.data.trialId).toBe(r1.body.data.trialId);
    expect(await trialKeyCount(a.userId)).toBe(2);
  });
});

describe('I5 + I8: trials close when the application leaves review; notes stay internal', () => {
  it('reject at trial_scheduled cancels the trial: no join token, no hour reminder', async () => {
    const { a, rev } = await inReview();
    const s = slots();
    const p = await invoke(trialPropose, { practitionerId: a.practitionerId, slots: s }, { token: rev.token });
    await invoke(trialSelect, { trialId: p.body.data.trialId, slotStart: s[0] }, { token: a.token });
    await invoke(adminTransition, { practitionerId: a.practitionerId, action: 'reject', reason: 'Not a fit', expectedStatus: 'trial_scheduled' }, { token: rev.token });
    const { data: t } = await serviceClient().from('trial_calls').select('status').eq('id', p.body.data.trialId).single();
    expect(t!.status).toBe('cancelled');
    const start = new Date(s[0]!).getTime();
    const join = await invoke(trialJoinToken, { trialId: p.body.data.trialId }, { token: a.token, deps: testDeps({}, { now: () => new Date(start) }) });
    expect(join.status).toBe(400);
    await invoke(jobs, { job: 'trial-reminders' }, { token: process.env.SUPABASE_SERVICE_ROLE_KEY!, deps: testDeps({}, { now: () => new Date(start - 60 * 60_000) }) });
    const { count } = await serviceClient().from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', a.userId).eq('template_key', 'trial_reminder');
    expect(count).toBe(0);
  });

  it('trial outcome notes go to internal review notes, not the applicant-readable trial row', async () => {
    const { a, rev } = await inReview();
    const s = slots();
    const p = await invoke(trialPropose, { practitionerId: a.practitionerId, slots: s }, { token: rev.token });
    await invoke(trialSelect, { trialId: p.body.data.trialId, slotStart: s[0] }, { token: a.token });
    await invoke(trialOutcome, { trialId: p.body.data.trialId, outcome: 'completed', notes: 'Strong presence, approve' }, { token: rev.token });
    const { data: mine } = await a.client.from('trial_calls').select('*').eq('id', p.body.data.trialId).single();
    expect(JSON.stringify(mine)).not.toContain('Strong presence');
    const { data: notes } = await serviceClient().from('review_notes').select('body').eq('practitioner_id', a.practitionerId);
    expect(notes?.[0]?.body).toContain('Strong presence, approve');
  });
});

describe('I6: Razorpay provisioning resumes after a partial failure', () => {
  it('failure after the stakeholder step does not create duplicate stakeholders', async () => {
    const a = await createApplicant();
    await fillApplication(a.practitionerId, a.userId);
    const db = serviceClient();
    const { data: checks } = await db.from('verification_checks').select('id,kind').eq('practitioner_id', a.practitionerId);
    const id = (k: string) => checks!.find((c: { kind: string }) => c.kind === k)!.id;
    await db.rpc('store_pan', { p_check_id: id('pan'), p_pan: 'ABCDE1234F' });
    await db.rpc('store_bank_account', { p_check_id: id('bank'), p_account: '123456783210', p_ifsc: 'HDFC0001234' });
    await setPractitionerStatus(a.practitionerId, 'approved');
    const rzp = new FakeRazorpay();
    rzp.failProductOnce = true;
    const ok = await provisionLinkedAccount(testDeps({}, { razorpay: rzp }), a.practitionerId);
    expect(ok).toBe(true);
    expect(rzp.stakeholderCalls).toBe(1);
    const { data } = await db.from('practitioners').select('razorpay_account_status').eq('id', a.practitionerId).single();
    expect(data!.razorpay_account_status).toBe('created');
  });
});

describe('I7: SMS hook only sends to Indian mobiles', () => {
  const SECRET = 'v1,whsec_M25heWFuLWxvY2FsLWRldi1ob29rLXNlY3JldC0wMDE=';
  const signed = (phone: string) => {
    const body = JSON.stringify({ user: { phone }, sms: { otp: '123456' } });
    const id = `msg_${crypto.randomUUID()}`;
    const ts = new Date();
    return new Request('http://local/h', {
      method: 'POST',
      body,
      headers: { 'webhook-id': id, 'webhook-timestamp': String(Math.floor(ts.getTime() / 1000)), 'webhook-signature': new Webhook(SECRET.replace('v1,whsec_', '')).sign(id, ts, body) },
    });
  };
  it('international number → 400 and nothing sent', async () => {
    const deps = testDeps({ SEND_SMS_HOOK_SECRET: SECRET });
    const res = await handleSendSms(signed('14155550100'), deps);
    expect(res.status).toBe(400);
    expect((deps.sms as FakeSms).outbox).toHaveLength(0);
  });
});
