// GENERATED — edit packages/shared/src and run `node scripts/sync-shared.mjs`.
import { z } from 'zod';
import { ALL_STATUSES, STAFF_ROLES } from '../status/practitioner.ts';

const id = z.string().uuid();
const isoDateTime = z.string().datetime({ offset: true });

export const emptySchema = z.object({}).strict();

export const kycPanVerifySchema = z.object({ pan: z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'Enter a valid PAN') });
export const kycBankVerifySchema = z.object({
  accountNumber: z.string().regex(/^\d{9,18}$/, 'Enter a valid account number'),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC code'),
});
export const kycDigilockerStartSchema = z.object({ platform: z.enum(['web', 'mobile']) });

export const STAFF_TRANSITION_ACTIONS = [
  'claim',
  'request_changes',
  'reject',
  'approve',
  'suspend',
  'reinstate',
  'trial_missed',
] as const;
export const adminTransitionSchema = z.object({
  practitionerId: id,
  action: z.enum(STAFF_TRANSITION_ACTIONS),
  reason: z.string().max(2000).optional(),
  expectedStatus: z.enum(ALL_STATUSES),
});

export const trialProposeSchema = z.object({ practitionerId: id, slots: z.array(isoDateTime) });
export const trialSelectSchema = z.object({ trialId: id, slotStart: isoDateTime });
export const trialIdSchema = z.object({ trialId: id });
export const trialOutcomeSchema = z.object({
  trialId: id,
  outcome: z.enum(['completed', 'missed']),
  notes: z.string().trim().min(1).max(5000),
});

export const staffDocumentUrlSchema = z.object({ path: z.string().min(3).max(500) });
export const practitionerIdSchema = z.object({ practitionerId: id });
export const accountDeletionProcessSchema = z.object({ requestId: id });
export const staffInviteSchema = z.object({ email: z.string().trim().email(), role: z.enum(STAFF_ROLES) });
export const jobsSchema = z.object({ job: z.enum(['trial-reminders', 'razorpay-sync', 'notification-retry']) });

export type AdminTransitionInput = z.infer<typeof adminTransitionSchema>;
export const adminReassignSchema = z.object({ practitionerId: id, reviewerId: id });
