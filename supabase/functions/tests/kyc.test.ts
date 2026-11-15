import { describe, expect, it } from 'vitest';
import { kycBankVerify } from '../kyc-bank-verify/handler.ts';
import { handleDigilockerCallback } from '../kyc-digilocker-callback/handler.ts';
import { kycDigilockerStart } from '../kyc-digilocker-start/handler.ts';
import { kycPanVerify } from '../kyc-pan-verify/handler.ts';
import { createApplicant, invoke, serviceClient, setPractitionerStatus, testDeps } from './helpers.ts';

const check = async (practitionerId: string, kind: string) =>
  (await serviceClient().from('verification_checks').select('*').eq('practitioner_id', practitionerId).eq('kind', kind).single())
    .data;

describe('KYC verification', () => {
  it('valid PAN records passed check with verified_name', async () => {
    const a = await createApplicant();
    const r = await invoke(kycPanVerify, { pan: 'ABCDE1234F' }, { token: a.token });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ status: 'passed' });
    expect(await check(a.practitionerId, 'pan')).toMatchObject({ status: 'passed', verified_name: 'RAHUL KUMAR SHARMA', attempts: 1 });
  });

  it("PAN + bank names 'RAHUL KUMAR SHARMA'/'RAHUL K SHARMA' → both passed", async () => {
    const a = await createApplicant();
    await invoke(kycPanVerify, { pan: 'ABCDE1234F' }, { token: a.token });
    const r = await invoke(kycBankVerify, { accountNumber: '123456783210', ifsc: 'HDFC0001234' }, { token: a.token });
    expect(r.body.data).toMatchObject({ status: 'passed' });
    expect((await check(a.practitionerId, 'pan'))?.status).toBe('passed');
  });

  it("bank holder 'PRIYA NAIR' → bank flagged with score < 0.85", async () => {
    const a = await createApplicant();
    await invoke(kycPanVerify, { pan: 'ABCDE1234F' }, { token: a.token });
    await invoke(kycBankVerify, { accountNumber: '991234563210', ifsc: 'HDFC0001234' }, { token: a.token });
    const bank = await check(a.practitionerId, 'bank');
    expect(bank?.status).toBe('flagged');
    expect(Number(bank?.name_match_score)).toBeLessThan(0.85);
  });

  it('invalid bank → failed, attempts 1', async () => {
    const a = await createApplicant();
    const r = await invoke(kycBankVerify, { accountNumber: '000000000000', ifsc: 'HDFC0001234' }, { token: a.token });
    expect(r.body.data).toMatchObject({ status: 'failed' });
    expect(await check(a.practitionerId, 'bank')).toMatchObject({ status: 'failed', attempts: 1 });
  });

  it('4th completed attempt in 24h → 400 kyc_attempts_exhausted', async () => {
    const a = await createApplicant();
    for (let i = 0; i < 3; i++)
      expect((await invoke(kycBankVerify, { accountNumber: '000000000000', ifsc: 'HDFC0001234' }, { token: a.token })).status).toBe(200);
    const r = await invoke(kycBankVerify, { accountNumber: '123456783210', ifsc: 'HDFC0001234' }, { token: a.token });
    expect(r.status).toBe(400);
    expect(r.body.error?.code).toBe('kyc_attempts_exhausted');
  });

  it('attempts older than 24h no longer count', async () => {
    const a = await createApplicant();
    const old = new Date(Date.now() - 25 * 3600_000);
    for (let i = 0; i < 3; i++)
      await invoke(kycBankVerify, { accountNumber: '000000000000', ifsc: 'HDFC0001234' }, { token: a.token, deps: testDeps({}, { now: () => old }) });
    const r = await invoke(kycBankVerify, { accountNumber: '123456783210', ifsc: 'HDFC0001234' }, { token: a.token });
    expect(r.status).toBe(200);
  });

  it('provider error does not consume attempt', async () => {
    const a = await createApplicant();
    const r = await invoke(kycPanVerify, { pan: 'ZZZZZ9999Z' }, { token: a.token });
    expect(r.status).toBe(503);
    expect(r.body.error?.code).toBe('provider_unavailable');
    const pan = await check(a.practitionerId, 'pan');
    expect(pan?.attempts ?? 0).toBe(0);
  });

  it('bank account stored encrypted: masked_ref XXXX3210 and the owner view never exposes the number', async () => {
    const a = await createApplicant();
    await invoke(kycBankVerify, { accountNumber: '123456783210', ifsc: 'HDFC0001234' }, { token: a.token });
    const { data } = await a.client.from('my_verification_checks').select('*').eq('kind', 'bank').single();
    expect(data?.masked_ref).toBe('XXXX3210');
    expect(JSON.stringify(data)).not.toContain('123456783210');
    const { data: plain } = await serviceClient().rpc('reveal_bank_account', { p_check_id: (await check(a.practitionerId, 'bank'))?.id });
    expect(plain).toBe('123456783210');
  });

  it('digilocker stores aadhaar last4 only', async () => {
    const a = await createApplicant();
    const deps = testDeps({ APP_URL: 'http://localhost:3000', SUPABASE_FUNCTIONS_URL: 'http://localhost:54321/functions/v1' });
    const start = await invoke(kycDigilockerStart, { platform: 'web' }, { token: a.token, deps });
    expect(start.status).toBe(200);
    const vid = new URL(start.body.data.url).searchParams.get('verification_id');
    const res = await handleDigilockerCallback(
      new Request(`http://local/kyc-digilocker-callback?verification_id=${vid}&state=web`),
      deps,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://localhost:3000/practitioner/apply/5?kyc=done');
    const row = await check(a.practitionerId, 'aadhaar');
    expect(row).toMatchObject({ status: 'passed', masked_ref: 'XXXX XXXX 1234', year_of_birth: 1990 });
    expect(JSON.stringify(row)).not.toMatch(/\d{12}/);
  });

  it('practitioner in submitted status → 400 invalid_transition', async () => {
    const a = await createApplicant();
    await setPractitionerStatus(a.practitionerId, 'submitted');
    const r = await invoke(kycPanVerify, { pan: 'ABCDE1234F' }, { token: a.token });
    expect(r.status).toBe(400);
    expect(r.body.error?.code).toBe('invalid_transition');
  });

  it('caller without an application → 404', async () => {
    const { createUser } = await import('./helpers.ts');
    const u = await createUser();
    const r = await invoke(kycPanVerify, { pan: 'ABCDE1234F' }, { token: u.token });
    expect(r.status).toBe(404);
  });
});
