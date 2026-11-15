'use client';

import { useCallback, useEffect, useState } from 'react';
import { listAttention, processDeletion, resolveAttention, retryLinkedAccount } from '@3nayan/client';
import { formatIST } from '@3nayan/shared';
import { Dialog } from '@/components/Dialog';
import { Alert, Button, Card } from '@/components/ui';
import { messageFor } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { RoleGate } from '@/lib/useStaff';

type Item = Awaited<ReturnType<typeof listAttention>>[number];

const KIND_LABEL: Record<string, string> = {
  linked_account_failed: 'Payout account setup failed',
  deletion_requested: 'Account deletion requested',
  trial_expired: 'Trial proposal expired',
  trial_reschedule_requested: 'Applicant asked for new trial times',
};

export default function AttentionPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    const list = await listAttention(sb);
    const ids = [...new Set(list.map((i) => i.target_id).filter((x): x is string => !!x))];
    const [ps, profiles] = ids.length
      ? await Promise.all([
          sb.from('practitioners').select('id,display_name').in('id', ids),
          sb.from('profiles').select('id,full_name').in('id', ids),
        ])
      : [{ data: [] }, { data: [] }];
    const map: Record<string, string> = {};
    for (const p of ps.data ?? []) if (p.display_name) map[p.id] = p.display_name;
    for (const p of profiles.data ?? []) if (p.full_name) map[p.id] = p.full_name;
    setNames(map);
    setItems(list);
  }, []);
  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    setError(null);
    try {
      await fn();
      setConfirm(null);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(null);
      await load();
    }
  }

  const who = (i: Item) => (i.target_id && names[i.target_id]) || 'Unknown';
  const groups = Object.entries(
    (items ?? []).reduce<Record<string, Item[]>>((acc, i) => ((acc[i.kind] ??= []).push(i), acc), {}),
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Needs attention</h1>
      {error && <Alert tone="danger">{error}</Alert>}
      {items === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : groups.length === 0 ? (
        <Card><p className="text-sm text-muted">Nothing needs attention right now.</p></Card>
      ) : (
        groups.map(([kind, list]) => (
          <Card key={kind}>
            <h2 className="font-semibold">{KIND_LABEL[kind] ?? kind} <span className="text-muted">({list.length})</span></h2>
            <ul className="mt-3 flex flex-col divide-y divide-line">
              {list.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium">{who(i)}</p>
                    {i.error && <p className="text-muted">{i.error}</p>}
                    <p className="text-xs text-muted">{formatIST(new Date(i.created_at))}</p>
                  </div>
                  <div className="flex gap-2">
                    {kind === 'linked_account_failed' && (
                      <RoleGate roles={['finance', 'super_admin']}>
                        <Button variant="secondary" className="!h-9" busy={busy === i.id} onClick={() => run(i.id, () => retryLinkedAccount(supabase(), i.target_id!))}>Retry</Button>
                      </RoleGate>
                    )}
                    {kind === 'deletion_requested' ? (
                      <RoleGate roles={['super_admin']}>
                        <Button variant="danger" className="!h-9" onClick={() => setConfirm(i)}>Process deletion</Button>
                      </RoleGate>
                    ) : (
                      <Button variant="ghost" className="!h-9" busy={busy === i.id} onClick={() => run(i.id, () => resolveAttention(supabase(), i.id))}>Resolve</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title={`Delete ${confirm ? who(confirm) : ''}’s account?`}>
        <p className="text-sm text-muted">
          Personal details are anonymised and the login is disabled. Verification results, consents and the audit trail are kept for legal records.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant="danger" busy={!!busy}
            onClick={() => confirm && run(confirm.id, () => processDeletion(supabase(), String((confirm.metadata as { requestId?: string }).requestId)))}>
            Delete {confirm ? who(confirm) : ''}’s account
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
