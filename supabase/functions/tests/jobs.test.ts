import { describe, expect, it } from 'vitest';
import { jobs } from '../jobs/handler.ts';
import type { FakeWhatsApp } from '../_shared/providers/msg91/fake.ts';
import { createApplicant, createStaff, invoke, serviceClient, setPractitionerStatus, testDeps } from './helpers.ts';

const H = 3600_000;
const svc = () => ({ token: process.env.SUPABASE_SERVICE_ROLE_KEY! });

async function trial(over: Record<string, unknown>) {
  const a = await createApplicant();
  const rev = await createStaff('reviewer');
  await setPractitionerStatus(a.practitionerId, 'in_review');
  const { data, error } = await serviceClient()
    .from('trial_calls')
    .insert({ practitioner_id: a.practitionerId, reviewer_id: rev.userId, proposed_slots: [], ...over })
    .select('id')
    .single();
  if (error) throw error;
  return { a, trialId: data.id as string };
}
const keyCount = async (userId: string, key: string) =>
  (await serviceClient().from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('template_key', key)).count;

describe('jobs', () => {
  it('pick reminder sent once at 72h', async () => {
    const now = new Date();
    const { a } = await trial({ status: 'proposed', proposed_at: new Date(now.getTime() - 73 * H).toISOString() });
    const deps = testDeps({}, { now: () => now });
    await invoke(jobs, { job: 'trial-reminders' }, { ...svc(), deps });
    await invoke(jobs, { job: 'trial-reminders' }, { ...svc(), deps });
    expect(await keyCount(a.userId, 'trial_pick_reminder')).toBe(1); // whatsapp only (no push token)
  });

  it('expired at 7d with attention item', async () => {
    const now = new Date();
    const { a, trialId } = await trial({ status: 'proposed', pick_reminder_sent: true, proposed_at: new Date(now.getTime() - 7 * 24 * H - 60_000).toISOString() });
    await invoke(jobs, { job: 'trial-reminders' }, { ...svc(), deps: testDeps({}, { now: () => now }) });
    const { data } = await serviceClient().from('trial_calls').select('status').eq('id', trialId).single();
    expect(data!.status).toBe('expired');
    const { data: att } = await serviceClient().from('attention_items').select('kind').eq('target_id', a.practitionerId);
    expect(att).toEqual([{ kind: 'trial_expired' }]);
  });

  it('hour reminder for trial starting in 60m, not for 2h', async () => {
    const now = new Date();
    const soon = await trial({ status: 'scheduled', scheduled_at: new Date(now.getTime() + 60 * 60_000).toISOString() });
    const later = await trial({ status: 'scheduled', scheduled_at: new Date(now.getTime() + 2 * H).toISOString() });
    const deps = testDeps({}, { now: () => now });
    await invoke(jobs, { job: 'trial-reminders' }, { ...svc(), deps });
    await invoke(jobs, { job: 'trial-reminders' }, { ...svc(), deps });
    expect(await keyCount(soon.a.userId, 'trial_reminder')).toBe(2); // sms + whatsapp, once
    expect(await keyCount(later.a.userId, 'trial_reminder')).toBe(0);
  });

  it('notification-retry resends a failed notification and marks it sent', async () => {
    const a = await createApplicant();
    const { data } = await serviceClient()
      .from('notifications')
      .insert({ user_id: a.userId, template_key: 'application_submitted', channel: 'whatsapp', status: 'failed', data: { name: 'Rahul' }, error: 'x' })
      .select('id')
      .single();
    const deps = testDeps();
    await invoke(jobs, { job: 'notification-retry' }, { ...svc(), deps });
    const { data: row } = await serviceClient().from('notifications').select('status,retries').eq('id', data!.id).single();
    expect(row).toEqual({ status: 'sent', retries: 1 });
    expect((deps.whatsapp as FakeWhatsApp).sent).toHaveLength(1);
  });

  it('notification-retry stops after 3 retries', async () => {
    const a = await createApplicant();
    const { data } = await serviceClient()
      .from('notifications')
      .insert({ user_id: a.userId, template_key: 'application_submitted', channel: 'whatsapp', status: 'failed', data: { name: 'Rahul' }, error: 'x' })
      .select('id')
      .single();
    const deps = testDeps();
    (deps.whatsapp as FakeWhatsApp).failWith = 'still down';
    for (let i = 0; i < 4; i++) await invoke(jobs, { job: 'notification-retry' }, { ...svc(), deps });
    const { data: row } = await serviceClient().from('notifications').select('status,retries,error').eq('id', data!.id).single();
    expect(row).toEqual({ status: 'failed', retries: 3, error: 'still down' });
  });

  it('missing bearer → 401', async () => {
    const r = await invoke(jobs, { job: 'razorpay-sync' });
    expect(r.status).toBe(401);
  });
});
