'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listApplications, listCategories, type ApplicationListItem, type CategoryNode } from '@3nayan/client';
import { ALL_STATUSES, type PractitionerStatus } from '@3nayan/shared';
import { Badge, Card, TextInput } from '@/components/ui';
import { STATUS_LABEL, STATUS_TONE, daysSince } from '@/lib/status';
import { supabase } from '@/lib/supabase';

export default function ApplicationsPage() {
  const [rows, setRows] = useState<ApplicationListItem[] | null>(null);
  const [cats, setCats] = useState<CategoryNode[]>([]);
  const [status, setStatus] = useState<PractitionerStatus | ''>('');
  const [categoryId, setCategoryId] = useState('');
  const [city, setCity] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    listCategories(supabase()).then(setCats);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      listApplications(supabase(), {
        status: status || undefined,
        categoryId: categoryId || undefined,
        city: city.trim() || undefined,
        flaggedOnly,
        olderThanDays: waiting ? 3 : undefined,
      }).then(setRows);
    }, 250);
    return () => clearTimeout(t);
  }, [status, categoryId, city, flaggedOnly, waiting]);

  const select = 'rounded-md border border-line bg-surface px-3 py-2 text-sm';
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Applications</h1>
      <Card className="flex flex-wrap items-end gap-4 !p-4">
        <label className="flex flex-col gap-1 text-sm">
          Status
          <select className={select} value={status} onChange={(e) => setStatus(e.target.value as PractitionerStatus | '')}>
            <option value="">All except draft</option>
            {ALL_STATUSES.filter((s) => s !== 'draft').map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Category
          <select className={select} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All</option>
            {cats.map((c) => (
              <optgroup key={c.id} label={c.name}>
                {c.children.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          City
          <TextInput value={city} onChange={(e) => setCity(e.target.value)} className="w-40" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
          Flagged checks only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={waiting} onChange={(e) => setWaiting(e.target.checked)} />
          Waiting more than 3 days
        </label>
      </Card>
      {rows === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <Card><p className="text-sm text-muted">No applications match these filters.</p></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Applicant</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Checks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const age = daysSince(r.submitted_at, now);
                return (
                  <tr key={r.id} className="hover:bg-canvas">
                    <td className="px-4 py-3">
                      <Link href={`/applications/${r.id}`} className="font-medium text-primary hover:underline">{r.display_name ?? 'Unnamed applicant'}</Link>
                    </td>
                    <td className="px-4 py-3"><Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
                    <td className="px-4 py-3">{r.city ?? '—'}</td>
                    <td className="px-4 py-3">
                      {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'}
                      {age > 3 && r.status === 'submitted' && <span className="ml-2"><Badge tone="warning">Waiting {age} days</Badge></span>}
                    </td>
                    <td className="px-4 py-3">{r.flagged ? <Badge tone="warning">Flagged</Badge> : <Badge tone="success">Clear</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
