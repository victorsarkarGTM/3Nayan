import { describe, expect, it } from 'vitest';
import { adminTransition } from '../admin-transition/handler.ts';
import { practitionerSubmit } from '../practitioner-submit/handler.ts';
import { hmsWebhook } from '../hms-webhook/handler.ts';
import { trialJoinToken } from '../trial-join-token/handler.ts';
import { trialOutcome } from '../trial-outcome/handler.ts';
import { trialPropose } from '../trial-propose/handler.ts';
import { trialRescheduleRequest } from '../trial-reschedule-request/handler.ts';
import { trialSelect } from '../trial-select/handler.ts';
import { createApplicant, createStaff, createUser, fillApplication, invoke, notificationKeys, serviceClient, testDeps } from './helpers.ts';

const H = 3600_000;
const slotsFrom = (base: number) => [base + 30 * H, base + 50 * H, base + 70 * H].map((t) => new Date(t).toISOString());
const pStatus = async (id: string) => (await serviceClient().from('practitioners').select('status').eq('id', id).single()).data!.status;

async function inReview() {
  const a = await createApplicant();
  await fillApplication(a.practitionerId, a.userId);
  await invoke(practitionerSubmit, {}, { token: a.token });
  const rev = await createStaff('reviewer');
  await invoke(adminTransition, { practitionerId: a.practitionerId, action: 'claim', expectedStatus: 'submitted' }, { token: rev.token });
  return { a, rev };
}
async function proposed() {
  const ctx = await inReview();
  const slots = slotsFrom(Date.now());
  const r = await invoke(trialPropose, { practitionerId: ctx.a.practitionerId, slots }, { token: ctx.rev.token });
  expect(r.status).toBe(200);
  return { ...ctx, slots, trialId: r.body.data.trialId as string };
}
async function scheduled() {
  const ctx = await proposed();
  const r = await invoke(trialSelect, { trialId: ctx.trialId, slotStart: ctx.slots[0] }, { token: ctx.a.token });
  expect(r.status).toBe(200);
  return ctx;
}

describe('trial calls', () => {
  it('trial-propose rejects slot under 24h by server clock', async () => {
    const { a, rev } = await inReview();
    const now = new Date('2026-11-20T04:30:00Z');
    const slots = [now.getTime() + 23 * H, now.getTime() + 48 * H, now.getTime() + 72 * H].map((t) => new Date(t).toISOString());
    const r = await invoke(trialPropose, { practitionerId: a.practitionerId, slots }, { token: rev.token, deps: testDeps({}, { now: () => now }) });
    expect(r.status).toBe(400);
    expect(r.body.error?.code).toBe('validation_failed');
  });

  it('propose valid → trial proposed + 3 notification rows', async () => {
    const { a, trialId } = await proposed();
    const { data } = await serviceClient().from('trial_calls').select('status').eq('id', trialId).single();
    expect(data!.status).toBe('proposed');
    const { data: n } = await serviceClient().from('notifications').select('channel').eq('user_id', a.userId).eq('template_key', 'trial_proposed');
    expect(n).toHaveLength(2); // sms + whatsapp (no push token registered for this user)
    expect(await notificationKeys(a.userId)).toContain('trial_proposed');
  });

  it('select slot not in proposal → 400 validation_failed', async () => {
    const { a, trialId } = await proposed();
    const r = await invoke(trialSelect, { trialId, slotStart: new Date(Date.now() + 40 * H).toISOString() }, { token: a.token });
    expect(r.status).toBe(400);
    expect(r.body.error?.code).toBe('validation_failed');
  });

  it('select valid → practitioner trial_scheduled, room created', async () => {
    const { a, trialId, slots } = await scheduled();
    expect(await pStatus(a.practitionerId)).toBe('trial_scheduled');
    const { data } = await serviceClient().from('trial_calls').select('status,scheduled_at,hms_room_id').eq('id', trialId).single();
    expect(data!.status).toBe('scheduled');
    expect(new Date(data!.scheduled_at).toISOString()).toBe(slots[0]);
    expect(data!.hms_room_id).toMatch(/^fake-room-/);
  });

  it('join token 11 min before → outside_join_window; at 10 min before → token', async () => {
    const { a, rev, trialId, slots } = await scheduled();
    const start = new Date(slots[0]!).getTime();
    const early = await invoke(trialJoinToken, { trialId }, { token: a.token, deps: testDeps({}, { now: () => new Date(start - 11 * 60_000) }) });
    expect(early.status).toBe(400);
    expect(early.body.error?.code).toBe('outside_join_window');
    const ok = await invoke(trialJoinToken, { trialId }, { token: a.token, deps: testDeps({}, { now: () => new Date(start - 10 * 60_000) }) });
    expect(ok.status).toBe(200);
    expect(ok.body.data.token).toContain('applicant');
    const revOk = await invoke(trialJoinToken, { trialId }, { token: rev.token, deps: testDeps({}, { now: () => new Date(start) }) });
    expect(revOk.body.data.token).toContain('reviewer');
  });

  it('a different user cannot get a join token → 403', async () => {
    const { trialId, slots } = await scheduled();
    const other = await createUser();
    const r = await invoke(trialJoinToken, { trialId }, { token: other.token, deps: testDeps({}, { now: () => new Date(slots[0]!) }) });
    expect(r.status).toBe(403);
  });

  it('reschedule twice → second 400 invalid_transition', async () => {
    const ctx = await scheduled();
    const first = await invoke(trialRescheduleRequest, { trialId: ctx.trialId }, { token: ctx.a.token });
    expect(first.status).toBe(200);
    expect(await pStatus(ctx.a.practitionerId)).toBe('in_review');
    const slots = slotsFrom(Date.now() + 5 * H);
    const p2 = await invoke(trialPropose, { practitionerId: ctx.a.practitionerId, slots }, { token: ctx.rev.token });
    await invoke(trialSelect, { trialId: p2.body.data.trialId, slotStart: slots[1] }, { token: ctx.a.token });
    const second = await invoke(trialRescheduleRequest, { trialId: p2.body.data.trialId }, { token: ctx.a.token });
    expect(second.status).toBe(400);
    expect(second.body.error?.code).toBe('invalid_transition');
  });

  it('outcome missed → practitioner in_review; outcome completed allows approve', async () => {
    const ctx = await scheduled();
    const missed = await invoke(trialOutcome, { trialId: ctx.trialId, outcome: 'missed', notes: 'No show' }, { token: ctx.rev.token });
    expect(missed.status).toBe(200);
    expect(await pStatus(ctx.a.practitionerId)).toBe('in_review');

    const slots = slotsFrom(Date.now() + 3 * H);
    const p2 = await invoke(trialPropose, { practitionerId: ctx.a.practitionerId, slots }, { token: ctx.rev.token });
    await invoke(trialSelect, { trialId: p2.body.data.trialId, slotStart: slots[2] }, { token: ctx.a.token });
    await invoke(trialOutcome, { trialId: p2.body.data.trialId, outcome: 'completed', notes: 'Great call' }, { token: ctx.rev.token });
    const approve = await invoke(adminTransition, { practitionerId: ctx.a.practitionerId, action: 'approve', expectedStatus: 'trial_scheduled' }, { token: ctx.rev.token });
    expect(approve.status).toBe(200);
    expect(await pStatus(ctx.a.practitionerId)).toBe('approved');
  });

  it('webhook with wrong secret → 401; valid join event → call_events row', async () => {
    const { trialId, a } = await scheduled();
    const { data: t } = await serviceClient().from('trial_calls').select('hms_room_id').eq('id', trialId).single();
    const deps = testDeps({ HMS_WEBHOOK_SECRET: 'hook-secret' });
    const event = { type: 'peer.join.success', data: { room_id: t!.hms_room_id, user_id: a.userId, joined_at: new Date().toISOString() } };
    const call = (secret: string) =>
      hmsWebhook(new Request('http://local/hms-webhook', { method: 'POST', body: JSON.stringify(event), headers: { 'x-3nayan-webhook-secret': secret } }), deps);
    expect((await call('wrong')).status).toBe(401);
    expect((await call('hook-secret')).status).toBe(200);
    const { data } = await serviceClient().from('call_events').select('event,user_id,call_kind').eq('call_id', trialId);
    expect(data).toEqual([{ event: 'join', user_id: a.userId, call_kind: 'trial' }]);
  });
});
