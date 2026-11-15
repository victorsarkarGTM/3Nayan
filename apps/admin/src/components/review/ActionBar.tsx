'use client';

import {
  adminTransition,
  listStaff,
  proposeTrial,
  reassignApplication,
  recordTrialOutcome,
} from '@3nayan/client';
import {
  AppError,
  USER_MESSAGES,
  formatIST,
  planTransition,
  validateProposedSlots,
  type TransitionAction,
} from '@3nayan/shared';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Field, TextArea, TextInput } from '@/components/ui';
import { messageFor } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useStaff } from '@/lib/useStaff';
import { Dialog } from './Dialog';
import type { Detail } from './Sections';

const SLOT_MESSAGES: Record<string, string> = {
  count: 'Add three different times',
  lead_time: 'Each time must be at least 24 hours from now',
  overlap: 'Times must not overlap (each call is 30 minutes)',
  invalid_date: 'Enter a valid date and time for each slot',
};

/** A reviewer types IST wall-clock time, whatever their device's time zone. */
const fromIstInput = (v: string) => (v ? new Date(`${v}:00+05:30`).toISOString() : '');

type Modal = null | 'request_changes' | 'reject' | 'propose' | 'outcome' | 'approve';

export function ActionBar({ d, reload }: { d: Detail; reload: () => Promise<void> }) {
  const staff = useStaff();
  const p = d.practitioner;
  const name = p.display_name ?? 'this applicant';
  const [modal, setModal] = useState<Modal>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [slots, setSlots] = useState(['', '', '']);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<'completed' | 'missed' | ''>('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewers, setReviewers] = useState<Array<{ user_id: string; email: string }>>([]);
  const [reassignTo, setReassignTo] = useState('');

  const openTrial = d.trials.find((t) => t.status === 'proposed' || t.status === 'scheduled');
  const latestTrial = d.trials[0];
  const actor = { kind: 'staff' as const, role: staff.role };
  const assignedElsewhere = p.assigned_reviewer_id && p.assigned_reviewer_id !== staff.userId && staff.role !== 'super_admin';
  const can = (action: TransitionAction) =>
    !assignedElsewhere &&
    planTransition(p.status, action, actor, {
      now: new Date(),
      reason: 'x',
      trialCompleted: latestTrial?.status === 'completed',
    }).ok;

  useEffect(() => {
    if (staff.role === 'super_admin')
      listStaff(supabase()).then((s) => setReviewers(s.filter((x) => x.active && ['reviewer', 'super_admin'].includes(x.role))));
  }, [staff.role]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setModal(null);
      setReason('');
      await reload();
    } catch (e) {
      setModal(null);
      setError(e instanceof AppError && e.code === 'conflict' ? USER_MESSAGES.conflict : messageFor(e));
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const transition = (action: 'claim' | 'request_changes' | 'reject' | 'approve', withReason = false) => {
    if (withReason && !reason.trim()) return setReasonError('Add a reason the applicant will see');
    return run(() =>
      adminTransition(supabase(), { practitionerId: p.id, action, expectedStatus: p.status, ...(withReason ? { reason } : {}) }),
    );
  };

  function sendSlots() {
    const iso = slots.map(fromIstInput);
    const check = validateProposedSlots(iso, new Date());
    if (!check.ok) return setSlotError(SLOT_MESSAGES[check.reason] ?? 'Check the times');
    setSlotError(null);
    return run(() => proposeTrial(supabase(), p.id, iso));
  }

  const reasonDialog = (kind: 'request_changes' | 'reject') => (
    <Dialog open={modal === kind} onClose={() => setModal(null)} title={kind === 'reject' ? `Reject ${name}?` : 'Request changes'}>
      <div className="flex flex-col gap-4">
        <Field label="Reason for the applicant" hint="They’ll see this in the app and by SMS/WhatsApp." error={modal === kind ? reasonError : null}>
          {(id, dsc) => <TextArea id={id} aria-describedby={dsc} value={reason} onChange={(e) => (setReason(e.target.value), setReasonError(null))} />}
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
          {kind === 'reject' ? (
            <Button variant="danger" busy={busy} onClick={() => transition('reject', true)}>Reject {name}</Button>
          ) : (
            <Button busy={busy} onClick={() => transition('request_changes', true)}>Send request</Button>
          )}
        </div>
      </div>
    </Dialog>
  );

  return (
    <Card className="flex flex-col gap-4">
      {error && <Alert tone="danger">{error}</Alert>}
      {assignedElsewhere && <Alert tone="info">Another reviewer is handling this application.</Alert>}
      {openTrial?.status === 'proposed' && (
        <div className="text-sm">
          <p className="font-medium">Waiting for the applicant to pick a time</p>
          <ul className="mt-1 text-muted">{openTrial.proposed_slots.map((s) => <li key={s}>{formatIST(new Date(s))}</li>)}</ul>
        </div>
      )}
      {openTrial?.status === 'scheduled' && openTrial.scheduled_at && (
        <p className="text-sm font-medium">Trial call: {formatIST(new Date(openTrial.scheduled_at))}</p>
      )}
      {latestTrial?.status === 'completed' && p.status === 'trial_scheduled' && <p className="text-sm text-success">Trial completed.</p>}
      {p.status === 'approved' && <p className="text-sm">Payout account: {p.razorpay_account_status ?? 'setting up'}</p>}

      <div className="flex flex-wrap gap-2">
        {can('claim') && <Button busy={busy} onClick={() => transition('claim')}>Claim</Button>}
        {p.status === 'in_review' && !assignedElsewhere && (
          <Button variant="secondary" onClick={() => (setSlotError(null), setModal('propose'))}>Propose trial times</Button>
        )}
        {openTrial?.status === 'scheduled' && !assignedElsewhere && (
          <Button variant="secondary" onClick={() => setModal('outcome')}>Record outcome</Button>
        )}
        {can('approve') && <Button onClick={() => setModal('approve')}>Approve</Button>}
        {can('request_changes') && <Button variant="secondary" onClick={() => (setReasonError(null), setModal('request_changes'))}>Request changes</Button>}
        {can('reject') && <Button variant="danger" onClick={() => (setReasonError(null), setModal('reject'))}>Reject</Button>}
      </div>

      {staff.role === 'super_admin' && !['draft', 'approved', 'rejected', 'suspended'].includes(p.status) && (
        <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
          <label className="flex flex-col gap-1 text-sm">
            Assign to
            <select className="rounded-md border border-line bg-surface px-3 py-2 text-sm" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
              <option value="">Choose a reviewer</option>
              {reviewers.map((r) => <option key={r.user_id} value={r.user_id}>{r.email}</option>)}
            </select>
          </label>
          <Button variant="secondary" disabled={!reassignTo} busy={busy} onClick={() => run(() => reassignApplication(supabase(), p.id, reassignTo))}>
            Reassign
          </Button>
        </div>
      )}

      {reasonDialog('request_changes')}
      {reasonDialog('reject')}
      <Dialog open={modal === 'propose'} onClose={() => setModal(null)} title="Propose trial times">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">Three 30-minute slots, each at least 24 hours from now. Times are IST.</p>
          {slots.map((v, i) => (
            <Field key={i} label={`Time ${i + 1} (IST)`}>
              {(id) => <TextInput id={id} type="datetime-local" value={v} onChange={(e) => (setSlots(slots.map((x, j) => (j === i ? e.target.value : x))), setSlotError(null))} />}
            </Field>
          ))}
          {slotError && <p role="alert" className="text-sm font-medium text-danger">{slotError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button busy={busy} onClick={sendSlots}>Send times</Button>
          </div>
        </div>
      </Dialog>
      <Dialog open={modal === 'outcome'} onClose={() => setModal(null)} title="Record trial outcome">
        <div className="flex flex-col gap-3">
          <fieldset className="flex gap-4 text-sm">
            <legend className="sr-only">Outcome</legend>
            <label className="flex items-center gap-2"><input type="radio" name="outcome" checked={outcome === 'completed'} onChange={() => setOutcome('completed')} />Completed</label>
            <label className="flex items-center gap-2"><input type="radio" name="outcome" checked={outcome === 'missed'} onChange={() => setOutcome('missed')} />Missed</label>
          </fieldset>
          <Field label="Notes from the call" hint="Internal — never shown to the applicant.">
            {(id, dsc) => <TextArea id={id} aria-describedby={dsc} value={notes} onChange={(e) => setNotes(e.target.value)} />}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button busy={busy} disabled={!outcome || !notes.trim()} onClick={() => run(() => recordTrialOutcome(supabase(), openTrial!.id, outcome as 'completed' | 'missed', notes))}>
              Save outcome
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog open={modal === 'approve'} onClose={() => setModal(null)} title={`Approve ${name}?`}>
        <p className="text-sm text-muted">They’ll be notified, and we’ll set up their payout account.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
          <Button busy={busy} onClick={() => transition('approve')}>Approve {name}</Button>
        </div>
      </Dialog>
    </Card>
  );
}
