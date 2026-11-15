import { expect, it } from 'vitest';
import { staffInvite } from '../staff-invite/handler.ts';
import { createStaff, invoke, serviceClient } from './helpers.ts';

it('inviting an email that already has an account sends a password link instead of claiming success', async () => {
  const boss = await createStaff('super_admin');
  const email = `exists-${Date.now()}@staff.3nayan.test`;
  await serviceClient().auth.admin.createUser({ email, email_confirm: true });
  const r = await invoke(staffInvite, { email, role: 'support' }, { token: boss.token });
  expect(r.status).toBe(200);
  expect(r.body.data.emailSent).toBe('password_link');
});
