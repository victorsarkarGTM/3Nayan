import { describe, expect, it } from 'vitest';
import { adminTransition } from '../admin-transition/handler.ts';
import { practitionerReapply } from '../practitioner-reapply/handler.ts';
import { practitionerSubmit } from '../practitioner-submit/handler.ts';
import {
  createApplicant,
  createStaff,
  fillApplication,
  invoke,
  notificationKeys,
  serviceClient,
  setPractitionerStatus,
  testDeps,
} from './helpers.ts';

const status = async (id: string) =>
  (await serviceClient().from('practitioners').select('status,assigned_reviewer_id,reapply_after,submitted_at').eq('id', id).single()).data!;
const historyCount = async (id: string) =>
  (await serviceClient().from('practitioner_status_history').select('id', { count: 'exact', head: true }).eq('practitioner_id', id)).count;

async function submitted() {
  const a = await createApplicant();
  await fillApplication(a.practitionerId, a.userId);
  const r = await invoke(practitionerSubmit, {}, { token: a.token });
  expect(r.status).toBe(200);
  return a;
}

describe('practitioner-submit', () => {
  it('submit incomplete → 400 incomplete_application', async () => {
    const a = await createApplicant();
    const r = await invoke(practitionerSubmit, {}, { token: a.token });
    expect(r.status).toBe(400);
    expect(r.body.error?.code).toBe('incomplete_application');
  });

  it('submit complete → submitted + application_submitted notification', async () => {
    const a = await submitted();
    const s = await status(a.practitionerId);
    expect(s.status).toBe('submitted');
    expect(s.submitted_at).not.toBeNull();
    expect(await notificationKeys(a.userId)).toEqual(['application_submitted']);
  });

  it('submit with an outdated agreement version → 400 incomplete_application', async () => {
    const a = await createApplicant();
    await fillApplication(a.practitionerId, a.userId);
    await serviceClient().from('practitioners').update({ agreement_version: 'draft-0' }).eq('id', a.practitionerId);
    const r = await invoke(practitionerSubmit, {}, { token: a.token });
    expect(r.body.error?.code).toBe('incomplete_application');
  });
});

describe('admin-transition', () => {
  it('claim by reviewer → in_review with assigned_reviewer_id', async () => {
    const a = await submitted();
    const rev = await createStaff('reviewer');
    const r = await invoke(adminTransition, { practitionerId: a.practitionerId, action: 'claim', expectedStatus: 'submitted' }, { token: rev.token });
    expect(r.status).toBe(200);
    expect(await status(a.practitionerId)).toMatchObject({ status: 'in_review', assigned_reviewer_id: rev.userId });
  });

  it('admin-transition concurrent actions: exactly one wins', async () => {
    const a = await submitted();
    const rev = await createStaff('reviewer');
    await invoke(adminTransition, { practitionerId: a.practitionerId, action: 'claim', expectedStatus: 'submitted' }, { token: rev.token });
    const before = await historyCount(a.practitionerId);
    const [x, y] = await Promise.all([
      invoke(adminTransition, { practitionerId: a.practitionerId, action: 'reject', reason: 'Not eligible', expectedStatus: 'in_review' }, { token: rev.token }),
      invoke(adminTransition, { practitionerId: a.practitionerId, action: 'request_changes', reason: 'More detail', expectedStatus: 'in_review' }, { token: rev.token }),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    expect(await historyCount(a.practitionerId)).toBe((before ?? 0) + 1);
    const keys = (await notificationKeys(a.userId)).filter((k) => k !== 'application_submitted');
    expect(keys).toHaveLength(1);
  });

  it('repeating claim by same reviewer → 200 no-op, no extra history row', async () => {
    const a = await submitted();
    const rev = await createStaff('reviewer');
    const body = { practitionerId: a.practitionerId, action: 'claim', expectedStatus: 'submitted' };
    await invoke(adminTransition, body, { token: rev.token });
    const before = await historyCount(a.practitionerId);
    const r = await invoke(adminTransition, body, { token: rev.token });
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ status: 'in_review' });
    expect(await historyCount(a.practitionerId)).toBe(before);
  });

  it('approve without completed trial → 400 invalid_transition', async () => {
    const a = await submitted();
    const rev = await createStaff('reviewer');
    await setPractitionerStatus(a.practitionerId, 'trial_scheduled');
    const r = await invoke(adminTransition, { practitionerId: a.practitionerId, action: 'approve', expectedStatus: 'trial_scheduled' }, { token: rev.token });
    expect(r.status).toBe(400);
    expect(r.body.error?.code).toBe('invalid_transition');
  });

  it('reject sets reapply_after = now + 30 days', async () => {
    const a = await submitted();
    const rev = await createStaff('reviewer');
    const now = new Date('2026-11-20T06:00:00Z');
    const deps = testDeps({}, { now: () => now });
    await invoke(adminTransition, { practitionerId: a.practitionerId, action: 'claim', expectedStatus: 'submitted' }, { token: rev.token, deps });
    const r = await invoke(adminTransition, { practitionerId: a.practitionerId, action: 'reject', reason: 'Not eligible', expectedStatus: 'in_review' }, { token: rev.token, deps });
    expect(r.status).toBe(200);
    expect(new Date((await status(a.practitionerId)).reapply_after!).toISOString()).toBe('2026-12-20T06:00:00.000Z');
    expect(await notificationKeys(a.userId)).toContain('application_rejected');
  });

  it('reviewer without aal2 → 403 forbidden', async () => {
    const a = await submitted();
    const rev = await createStaff('reviewer', { mfa: false });
    const r = await invoke(adminTransition, { practitionerId: a.practitionerId, action: 'claim', expectedStatus: 'submitted' }, { token: rev.token });
    expect(r.status).toBe(403);
  });

  it('other reviewer acting on assigned application → 403', async () => {
    const a = await submitted();
    const rev1 = await createStaff('reviewer');
    const rev2 = await createStaff('reviewer');
    await invoke(adminTransition, { practitionerId: a.practitionerId, action: 'claim', expectedStatus: 'submitted' }, { token: rev1.token });
    const r = await invoke(adminTransition, { practitionerId: a.practitionerId, action: 'reject', reason: 'x', expectedStatus: 'in_review' }, { token: rev2.token });
    expect(r.status).toBe(403);
  });

  it('applicant cannot use admin-transition', async () => {
    const a = await submitted();
    const r = await invoke(adminTransition, { practitionerId: a.practitionerId, action: 'claim', expectedStatus: 'submitted' }, { token: a.token });
    expect(r.status).toBe(403);
  });
});

describe('practitioner-reapply', () => {
  it('reapply before reapply_after → 400 reapply_too_soon', async () => {
    const a = await createApplicant();
    await serviceClient()
      .from('practitioners')
      .update({ status: 'rejected', reapply_after: new Date(Date.now() + 86_400_000).toISOString() })
      .eq('id', a.practitionerId);
    const r = await invoke(practitionerReapply, {}, { token: a.token });
    expect(r.status).toBe(400);
    expect(r.body.error?.code).toBe('reapply_too_soon');
  });

  it('reapply after the wait → draft with agreement cleared', async () => {
    const a = await createApplicant();
    await fillApplication(a.practitionerId, a.userId);
    await serviceClient()
      .from('practitioners')
      .update({ status: 'rejected', reapply_after: new Date(Date.now() - 1000).toISOString() })
      .eq('id', a.practitionerId);
    const r = await invoke(practitionerReapply, {}, { token: a.token });
    expect(r.status).toBe(200);
    const { data } = await serviceClient().from('practitioners').select('status,declaration_accepted,agreement_version,bio').eq('id', a.practitionerId).single();
    expect(data).toMatchObject({ status: 'draft', declaration_accepted: false, agreement_version: null });
    expect(data!.bio).toBeTruthy();
  });
});
