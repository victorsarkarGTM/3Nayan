'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminTransition, searchPractitioners } from '@3nayan/client';
import { AppError, USER_MESSAGES, planTransition, type PractitionerStatus } from '@3nayan/shared';
import { Dialog } from '@/components/Dialog';
import { Alert, Badge, Button, Field, TextArea, TextInput } from '@/components/ui';
import { messageFor } from '@/lib/errors';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/status';
import { supabase } from '@/lib/supabase';
import { useStaff } from '@/lib/useStaff';

type Row = Awaited<ReturnType<typeof searchPractitioners>>[number];

export default function PractitionersPage() {
  const staff = useStaff();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [target, setTarget] = useState<Row | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => searchPractitioners(supabase(), q).then(setRows), [q]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const can = (status: PractitionerStatus, action: 'suspend' | 'reinstate') =>
    planTransition(status, action, { kind: 'staff', role: staff.role }, { now: new Date(), reason: 'x' }).ok;

  async function act(row: Row, action: 'suspend' | 'reinstate', withReason?: string) {
    setBusy(true);
    setError(null);
    try {
      await adminTransition(supabase(), { practitionerId: row.id, action, expectedStatus: row.status as PractitionerStatus, ...(withReason ? { reason: withReason } : {}) });
      setTarget(null);
      setReason('');
    } catch (e) {
      setError(e instanceof AppError && e.code === 'conflict' ? USER_MESSAGES.conflict : messageFor(e));
    } finally {
      setBusy(false);
      await load();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Practitioners</h1>
      <div className="max-w-md">
        <Field label="Search by name or phone">
          {(id) => <TextInput id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} />}
        </Field>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">City</th><th className="px-4 py-3">Payout account</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows === null && <tr><td colSpan={5} className="px-4 py-3 text-muted">Loading…</td></tr>}
            {rows?.length === 0 && <tr><td colSpan={5} className="px-4 py-3 text-muted">No practitioners found.</td></tr>}
            {rows?.map((r) => {
              const s = r.status as PractitionerStatus;
              return (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium">{r.display_name ?? 'Unnamed'}</td>
                  <td className="px-4 py-3"><Badge tone={STATUS_TONE[s]}>{STATUS_LABEL[s]}</Badge></td>
                  <td className="px-4 py-3">{r.city ?? '—'}</td>
                  <td className="px-4 py-3">{r.razorpay_account_status ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {can(s, 'suspend') && <Button variant="secondary" className="!h-9" onClick={() => setTarget(r)}>Suspend</Button>}
                    {can(s, 'reinstate') && <Button variant="secondary" className="!h-9" busy={busy} onClick={() => act(r, 'reinstate')}>Reinstate</Button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Dialog open={!!target} onClose={() => setTarget(null)} title={`Suspend ${target?.display_name ?? ''}?`}>
        <div className="flex flex-col gap-4">
          <Field label="Reason" hint="Shared with the practitioner by SMS/WhatsApp.">
            {(id, d) => <TextArea id={id} aria-describedby={d} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTarget(null)}>Cancel</Button>
            <Button variant="danger" busy={busy} disabled={!reason.trim()} onClick={() => target && act(target, 'suspend', reason)}>
              Suspend {target?.display_name}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
