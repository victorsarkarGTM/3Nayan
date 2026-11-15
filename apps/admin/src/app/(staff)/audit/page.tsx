'use client';

import { useEffect, useState } from 'react';
import { listAudit } from '@3nayan/client';
import { formatIST } from '@3nayan/shared';
import { Field, TextInput } from '@/components/ui';
import { supabase } from '@/lib/supabase';

type Entry = Awaited<ReturnType<typeof listAudit>>[number];

export default function AuditPage() {
  const [action, setAction] = useState('');
  const [rows, setRows] = useState<Entry[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => listAudit(supabase(), { action: action.trim() || undefined, limit: 200 }).then(setRows), 250);
    return () => clearTimeout(t);
  }, [action]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <div className="w-72">
        <Field label="Action" hint="Exact action, e.g. document.view or practitioner.approve">
          {(id, d) => <TextInput id={id} aria-describedby={d} value={action} onChange={(e) => setAction(e.target.value)} />}
        </Field>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-4 py-3">When (IST)</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Details</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows === null && <tr><td colSpan={5} className="px-4 py-3 text-muted">Loading…</td></tr>}
            {rows?.length === 0 && <tr><td colSpan={5} className="px-4 py-3 text-muted">No entries.</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-4 py-3">{formatIST(new Date(r.created_at))}</td>
                <td className="px-4 py-3">{r.actor_kind}<span className="block font-mono text-xs text-muted">{r.actor_id?.slice(0, 8)}</span></td>
                <td className="px-4 py-3 font-mono text-xs">{r.action}</td>
                <td className="px-4 py-3">{r.target_table}<span className="block font-mono text-xs text-muted">{r.target_id?.slice(0, 8)}</span></td>
                <td className="px-4 py-3 font-mono text-xs break-all">{JSON.stringify(r.metadata)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
