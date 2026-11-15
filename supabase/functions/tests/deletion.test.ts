import { describe, expect, it } from 'vitest';
import { accountDeletionProcess } from '../account-deletion-process/handler.ts';
import { accountDeletionRequest } from '../account-deletion-request/handler.ts';
import { createApplicant, createStaff, fillApplication, invoke, serviceClient } from './helpers.ts';

describe('account deletion', () => {
  it('deletion request twice → same id', async () => {
    const a = await createApplicant();
    const r1 = await invoke(accountDeletionRequest, {}, { token: a.token });
    const r2 = await invoke(accountDeletionRequest, {}, { token: a.token });
    expect(r1.status).toBe(200);
    expect(r2.body.data.requestId).toBe(r1.body.data.requestId);
  });

  it('deletion process anonymises profile, keeps verification_checks, bans auth user; second call no-op', async () => {
    const a = await createApplicant();
    await fillApplication(a.practitionerId, a.userId);
    const req = await invoke(accountDeletionRequest, {}, { token: a.token });
    const admin = await createStaff('super_admin');
    const r = await invoke(accountDeletionProcess, { requestId: req.body.data.requestId }, { token: admin.token });
    expect(r.status).toBe(200);
    const db = serviceClient();
    const { data: profile } = await db.from('profiles').select('full_name,phone,deleted_at').eq('id', a.userId).single();
    expect(profile).toMatchObject({ full_name: 'Deleted user', phone: null });
    expect(profile!.deleted_at).not.toBeNull();
    const { data: p } = await db.from('practitioners').select('bio,display_name,video_path').eq('id', a.practitionerId).single();
    expect(p).toMatchObject({ bio: null, display_name: 'Deleted practitioner', video_path: null });
    const { count } = await db.from('verification_checks').select('id', { count: 'exact', head: true }).eq('practitioner_id', a.practitionerId);
    expect(count).toBe(3);
    const { data: u } = await db.auth.admin.getUserById(a.userId);
    expect(u.user?.banned_until).toBeTruthy();
    const again = await invoke(accountDeletionProcess, { requestId: req.body.data.requestId }, { token: admin.token });
    expect(again.status).toBe(200);
    expect(again.body.data).toEqual({ status: 'completed', noop: true });
  });

  it('support cannot process deletions → 403', async () => {
    const a = await createApplicant();
    const req = await invoke(accountDeletionRequest, {}, { token: a.token });
    const sup = await createStaff('support');
    const r = await invoke(accountDeletionProcess, { requestId: req.body.data.requestId }, { token: sup.token });
    expect(r.status).toBe(403);
  });
});
