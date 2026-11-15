import type { PractitionerStatus } from '@3nayan/shared';

export const STATUS_LABEL: Record<PractitionerStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  trial_scheduled: 'Trial scheduled',
  approved: 'Approved',
  rejected: 'Rejected',
  suspended: 'Suspended',
};

export const STATUS_TONE: Record<PractitionerStatus, 'neutral' | 'primary' | 'warning' | 'success' | 'danger'> = {
  draft: 'neutral',
  submitted: 'primary',
  in_review: 'primary',
  changes_requested: 'warning',
  trial_scheduled: 'primary',
  approved: 'success',
  rejected: 'danger',
  suspended: 'danger',
};

export const daysSince = (iso: string | null, now = Date.now()) => (iso ? Math.floor((now - new Date(iso).getTime()) / 86_400_000) : 0);
