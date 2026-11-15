import { describe, expect, it } from 'vitest';
import { notify } from '../_shared/notifications/notify.ts';
import { TEMPLATES } from '../_shared/notifications/templates.ts';
import type { FakePush } from '../_shared/providers/push/fake.ts';
import type { FakeWhatsApp } from '../_shared/providers/msg91/fake.ts';
import { createUser, serviceClient, testDeps } from './helpers.ts';

async function userWithToken(token = `ExponentPushToken[${crypto.randomUUID()}]`) {
  const u = await createUser();
  await serviceClient().from('device_tokens').insert({ user_id: u.userId, expo_token: token, platform: 'android' });
  return { ...u, pushToken: token };
}
const rows = async (userId: string) =>
  (await serviceClient().from('notifications').select('channel,status,error').eq('user_id', userId)).data ?? [];

describe('notify', () => {
  it('application_submitted sends whatsapp+push only (no sms row)', async () => {
    const u = await userWithToken();
    const deps = testDeps();
    const r = await notify(deps, u.userId, 'application_submitted', { name: 'Asha' });
    expect(r.sent.sort()).toEqual(['push', 'whatsapp']);
    expect((await rows(u.userId)).map((x) => x.channel).sort()).toEqual(['push', 'whatsapp']);
  });

  it('trial_proposed writes 3 notification rows', async () => {
    const u = await userWithToken();
    await notify(testDeps(), u.userId, 'trial_proposed', { name: 'Asha', slots: 'a | b | c' });
    expect(await rows(u.userId)).toHaveLength(3);
  });

  it('whatsapp failure still sends push and records failed row with error', async () => {
    const u = await userWithToken();
    const deps = testDeps();
    (deps.whatsapp as FakeWhatsApp).failWith = 'template not approved';
    const r = await notify(deps, u.userId, 'application_submitted', { name: 'Asha' });
    expect(r.failed).toEqual(['whatsapp']);
    expect(r.sent).toEqual(['push']);
    const wa = (await rows(u.userId)).find((x) => x.channel === 'whatsapp');
    expect(wa).toMatchObject({ status: 'failed', error: 'template not approved' });
    expect((deps.push as FakePush).sent).toHaveLength(1);
  });

  it('DeviceNotRegistered token is deleted', async () => {
    const u = await userWithToken('ExponentPushToken[dead-token]');
    const deps = testDeps();
    (deps.push as FakePush).unregistered.add('ExponentPushToken[dead-token]');
    await notify(deps, u.userId, 'application_submitted', { name: 'Asha' });
    const { data } = await serviceClient().from('device_tokens').select('id').eq('user_id', u.userId);
    expect(data).toEqual([]);
  });

  it('every TemplateKey in spec list exists', () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual(
      [
        'application_submitted',
        'application_changes_requested',
        'trial_proposed',
        'trial_pick_reminder',
        'trial_reminder',
        'application_approved',
        'application_rejected',
        'account_suspended',
      ].sort(),
    );
  });
});
