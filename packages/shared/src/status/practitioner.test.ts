import { describe, expect, it } from 'vitest';
import {
  ALL_ACTIONS,
  ALL_STATUSES,
  planTransition,
  type Actor,
  type TransitionContext,
} from './practitioner.ts';

const now = new Date('2026-11-15T10:00:00Z');
const ctx = (over: Partial<TransitionContext> = {}): TransitionContext => ({ now, ...over });
const practitioner: Actor = { kind: 'practitioner' };
const reviewer: Actor = { kind: 'staff', role: 'reviewer' };
const superAdmin: Actor = { kind: 'staff', role: 'super_admin' };
const support: Actor = { kind: 'staff', role: 'support' };
const finance: Actor = { kind: 'staff', role: 'finance' };
const system: Actor = { kind: 'system' };

describe('allowed transitions', () => {
  it.each([
    ['draft', 'submit', practitioner, { applicationComplete: true }, 'submitted'],
    ['changes_requested', 'submit', practitioner, { applicationComplete: true }, 'submitted'],
    ['submitted', 'claim', reviewer, {}, 'in_review'],
    ['in_review', 'request_changes', reviewer, { reason: 'Add certificate' }, 'changes_requested'],
    ['trial_scheduled', 'request_changes', superAdmin, { reason: 'Clearer video' }, 'changes_requested'],
    ['in_review', 'reject', reviewer, { reason: 'Not eligible' }, 'rejected'],
    ['trial_scheduled', 'reject', reviewer, { reason: 'Trial concerns' }, 'rejected'],
    ['in_review', 'schedule_trial', system, {}, 'trial_scheduled'],
    ['trial_scheduled', 'trial_missed', reviewer, {}, 'in_review'],
    ['trial_scheduled', 'trial_reschedule', practitioner, { rescheduleUsed: false }, 'in_review'],
    ['trial_scheduled', 'approve', reviewer, { trialCompleted: true }, 'approved'],
    ['approved', 'suspend', support, { reason: 'Reports' }, 'suspended'],
    ['approved', 'suspend', superAdmin, { reason: 'Reports' }, 'suspended'],
    ['suspended', 'reinstate', superAdmin, {}, 'approved'],
    ['rejected', 'reapply', practitioner, { reapplyAfter: now }, 'draft'],
  ] as const)('%s --%s--> %s', (from, action, actor, extra, to) => {
    expect(planTransition(from, action, actor, ctx(extra))).toEqual({ ok: true, to });
  });
});

describe('refusals', () => {
  it('submit from in_review → invalid_transition', () =>
    expect(planTransition('in_review', 'submit', practitioner, ctx({ applicationComplete: true }))).toEqual({
      ok: false,
      code: 'invalid_transition',
    }));
  it('claim by support → forbidden', () =>
    expect(planTransition('submitted', 'claim', support, ctx())).toEqual({ ok: false, code: 'forbidden' }));
  it("reject with reason '  ' → validation_failed", () =>
    expect(planTransition('in_review', 'reject', reviewer, ctx({ reason: '  ' }))).toEqual({
      ok: false,
      code: 'validation_failed',
    }));
  it('approve with trialCompleted false → invalid_transition', () =>
    expect(planTransition('trial_scheduled', 'approve', reviewer, ctx({ trialCompleted: false }))).toEqual({
      ok: false,
      code: 'invalid_transition',
    }));
  it('trial_reschedule with rescheduleUsed → invalid_transition', () =>
    expect(
      planTransition('trial_scheduled', 'trial_reschedule', practitioner, ctx({ rescheduleUsed: true })),
    ).toEqual({ ok: false, code: 'invalid_transition' }));
  it('reapply 1ms before reapplyAfter → reapply_too_soon', () =>
    expect(
      planTransition('rejected', 'reapply', practitioner, ctx({ reapplyAfter: new Date(now.getTime() + 1) })),
    ).toEqual({ ok: false, code: 'reapply_too_soon' }));
  it('submit with applicationComplete false → incomplete_application', () =>
    expect(planTransition('draft', 'submit', practitioner, ctx({ applicationComplete: false }))).toEqual({
      ok: false,
      code: 'incomplete_application',
    }));
  it('reinstate by support → forbidden', () =>
    expect(planTransition('suspended', 'reinstate', support, ctx())).toEqual({ ok: false, code: 'forbidden' }));
  it('finance can do nothing', () => {
    const full = ctx({ reason: 'r', trialCompleted: true, rescheduleUsed: false, reapplyAfter: now, applicationComplete: true });
    for (const from of ALL_STATUSES)
      for (const action of ALL_ACTIONS) expect(planTransition(from, action, finance, full).ok).toBe(false);
  });
});
