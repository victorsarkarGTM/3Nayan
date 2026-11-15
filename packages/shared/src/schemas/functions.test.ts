import { expect, it } from 'vitest';
import { adminTransitionSchema, trialProposeSchema } from './functions.ts';

it('adminTransitionSchema rejects actions staff cannot request directly', () => {
  const base = { practitionerId: '00000000-0000-4000-8000-000000000001', expectedStatus: 'submitted' };
  expect(adminTransitionSchema.safeParse({ ...base, action: 'claim' }).success).toBe(true);
  expect(adminTransitionSchema.safeParse({ ...base, action: 'schedule_trial' }).success).toBe(false);
  expect(adminTransitionSchema.safeParse({ ...base, action: 'submit' }).success).toBe(false);
});
it('trialProposeSchema requires ISO date-times', () => {
  const practitionerId = '00000000-0000-4000-8000-000000000001';
  expect(trialProposeSchema.safeParse({ practitionerId, slots: ['tomorrow'] }).success).toBe(false);
});
