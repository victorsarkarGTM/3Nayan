import { beforeEach, describe, expect, it } from 'vitest';
import { Webhook } from 'standardwebhooks';
import { handleSendSms } from '../auth-send-sms/handler.ts';
import { serviceClient, testDeps } from './helpers.ts';
import type { FakeSms } from '../_shared/providers/msg91/fake.ts';

const SECRET = 'v1,whsec_M25heWFuLWxvY2FsLWRldi1ob29rLXNlY3JldC0wMDE=';

function signed(payload: object, secret = SECRET): Request {
  const body = JSON.stringify(payload);
  const id = `msg_${crypto.randomUUID()}`;
  const ts = new Date();
  const sig = new Webhook(secret.replace('v1,whsec_', '')).sign(id, ts, body);
  return new Request('http://local/auth-send-sms', {
    method: 'POST',
    body,
    headers: { 'webhook-id': id, 'webhook-timestamp': String(Math.floor(ts.getTime() / 1000)), 'webhook-signature': sig },
  });
}
const payload = (phone: string) => ({ user: { id: crypto.randomUUID(), phone }, sms: { otp: '123456' } });

describe('auth-send-sms', () => {
  beforeEach(async () => {
    await serviceClient().from('otp_sends').delete().like('phone', '+9199999000%');
  });

  it('rejects bad signature', async () => {
    const deps = testDeps({ SEND_SMS_HOOK_SECRET: SECRET });
    const res = await handleSendSms(signed(payload('919999900001'), 'v1,whsec_' + btoa('another-secret-another-sec')), deps);
    expect(res.status).toBe(401);
    expect((deps.sms as FakeSms).outbox).toHaveLength(0);
  });

  it('valid signature sends the OTP', async () => {
    const deps = testDeps({ SEND_SMS_HOOK_SECRET: SECRET });
    const res = await handleSendSms(signed(payload('919999900001')), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect((deps.sms as FakeSms).outbox).toEqual([{ phone: '+919999900001', otp: '123456' }]);
  });

  it('6th OTP for same phone within an hour → 429 and nothing sent', async () => {
    const deps = testDeps({ SEND_SMS_HOOK_SECRET: SECRET });
    for (let i = 0; i < 5; i++) expect((await handleSendSms(signed(payload('919999900009')), deps)).status).toBe(200);
    const res = await handleSendSms(signed(payload('919999900009')), deps);
    expect(res.status).toBe(429);
    expect((await res.json()).error.http_code).toBe(429);
    expect((deps.sms as FakeSms).outbox).toHaveLength(5);
  });
});
