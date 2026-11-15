import { describe, expect, it } from 'vitest';
import { staffInvite } from '../staff-invite/handler.ts';
import { createStaff, invoke, serviceClient } from './helpers.ts';

describe('staff-invite', () => {
  it('reviewer → 403', async () => {
    const rev = await createStaff('reviewer');
    const r = await invoke(staffInvite, { email: `x-${Date.now()}@staff.3nayan.test`, role: 'support' }, { token: rev.token });
    expect(r.status).toBe(403);
  });
  it('super_admin inviting the same email twice → one staff row with the latest role', async () => {
    const boss = await createStaff('super_admin');
    const email = `new-${Date.now()}@staff.3nayan.test`;
    expect((await invoke(staffInvite, { email, role: 'support' }, { token: boss.token })).status).toBe(200);
    expect((await invoke(staffInvite, { email, role: 'finance' }, { token: boss.token })).status).toBe(200);
    const { data } = await serviceClient().from('staff').select('role,active').eq('email', email);
    expect(data).toEqual([{ role: 'finance', active: true }]);
  });
});
