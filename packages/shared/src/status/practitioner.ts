export const ALL_STATUSES = [
  'draft',
  'submitted',
  'in_review',
  'changes_requested',
  'trial_scheduled',
  'approved',
  'rejected',
  'suspended',
] as const;
export type PractitionerStatus = (typeof ALL_STATUSES)[number];

export const STAFF_ROLES = ['reviewer', 'support', 'finance', 'super_admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type Actor = { kind: 'practitioner' } | { kind: 'staff'; role: StaffRole } | { kind: 'system' };

export const ALL_ACTIONS = [
  'submit',
  'claim',
  'request_changes',
  'reject',
  'schedule_trial',
  'trial_missed',
  'trial_reschedule',
  'approve',
  'suspend',
  'reinstate',
  'reapply',
] as const;
export type TransitionAction = (typeof ALL_ACTIONS)[number];

export type TransitionContext = {
  reason?: string;
  trialCompleted?: boolean;
  rescheduleUsed?: boolean;
  reapplyAfter?: Date | null;
  now: Date;
  applicationComplete?: boolean;
};

export type TransitionResult =
  | { ok: true; to: PractitionerStatus }
  | {
      ok: false;
      code: 'invalid_transition' | 'forbidden' | 'validation_failed' | 'incomplete_application' | 'reapply_too_soon';
    };

export const REASON_REQUIRED: TransitionAction[] = ['request_changes', 'reject', 'suspend'];

type ActorKey = 'practitioner' | 'system' | StaffRole;
const REVIEWERS: ActorKey[] = ['reviewer', 'super_admin'];

type Rule = {
  from: Partial<Record<PractitionerStatus, PractitionerStatus>>;
  actors: ActorKey[];
  check?: (ctx: TransitionContext) => TransitionResult | null;
};

const RULES: Record<TransitionAction, Rule> = {
  submit: {
    from: { draft: 'submitted', changes_requested: 'submitted' },
    actors: ['practitioner'],
    check: (c) => (c.applicationComplete === true ? null : { ok: false, code: 'incomplete_application' }),
  },
  claim: { from: { submitted: 'in_review' }, actors: REVIEWERS },
  request_changes: {
    from: { in_review: 'changes_requested', trial_scheduled: 'changes_requested' },
    actors: REVIEWERS,
  },
  reject: { from: { in_review: 'rejected', trial_scheduled: 'rejected' }, actors: REVIEWERS },
  schedule_trial: { from: { in_review: 'trial_scheduled' }, actors: ['system'] },
  trial_missed: { from: { trial_scheduled: 'in_review' }, actors: REVIEWERS },
  trial_reschedule: {
    from: { trial_scheduled: 'in_review' },
    actors: ['practitioner'],
    check: (c) => (c.rescheduleUsed === false ? null : { ok: false, code: 'invalid_transition' }),
  },
  approve: {
    from: { trial_scheduled: 'approved' },
    actors: REVIEWERS,
    check: (c) => (c.trialCompleted === true ? null : { ok: false, code: 'invalid_transition' }),
  },
  suspend: { from: { approved: 'suspended' }, actors: ['support', 'super_admin'] },
  reinstate: { from: { suspended: 'approved' }, actors: ['super_admin'] },
  reapply: {
    from: { rejected: 'draft' },
    actors: ['practitioner'],
    check: (c) =>
      c.reapplyAfter == null || c.now.getTime() >= c.reapplyAfter.getTime()
        ? null
        : { ok: false, code: 'reapply_too_soon' },
  },
};

const actorKey = (a: Actor): ActorKey => (a.kind === 'staff' ? a.role : a.kind);

export function planTransition(
  from: PractitionerStatus,
  action: TransitionAction,
  actor: Actor,
  ctx: TransitionContext,
): TransitionResult {
  const rule = RULES[action];
  const to = rule.from[from];
  if (!to) return { ok: false, code: 'invalid_transition' };
  if (!rule.actors.includes(actorKey(actor))) return { ok: false, code: 'forbidden' };
  if (REASON_REQUIRED.includes(action) && !ctx.reason?.trim()) return { ok: false, code: 'validation_failed' };
  const failed = rule.check?.(ctx);
  if (failed) return failed;
  return { ok: true, to };
}
