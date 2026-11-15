'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listMyTrials } from '@3nayan/client';
import { formatIST, isWithinJoinWindow } from '@3nayan/shared';
import { Badge, Button, Card } from '@/components/ui';
import { supabase } from '@/lib/supabase';

type Trial = Awaited<ReturnType<typeof listMyTrials>>[number];

export default function TrialsPage() {
  const [trials, setTrials] = useState<Trial[] | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    listMyTrials(supabase()).then(setTrials);
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const upcoming = (trials ?? []).filter((t) => t.status === 'scheduled' || t.status === 'proposed');
  const past = (trials ?? []).filter((t) => t.status === 'completed' || t.status === 'missed');
  const name = (t: Trial) => (t.practitioners as { display_name: string | null } | null)?.display_name ?? 'Applicant';

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">My trial calls</h1>
      {trials === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          <Card className="!p-0">
            <table className="w-full text-left text-sm">
              <caption className="px-4 pt-4 text-left font-semibold">Upcoming</caption>
              <thead className="text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-3">Applicant</th><th className="px-4 py-3">When (IST)</th><th className="px-4 py-3" /></tr></thead>
              <tbody className="divide-y divide-line">
                {upcoming.length === 0 && <tr><td className="px-4 py-3 text-muted" colSpan={3}>No upcoming calls.</td></tr>}
                {upcoming.map((t) => {
                  const start = t.scheduled_at ? new Date(t.scheduled_at) : null;
                  const open = start ? isWithinJoinWindow(start, now) : false;
                  return (
                    <tr key={t.id}>
                      <td className="px-4 py-3"><Link className="text-primary hover:underline" href={`/applications/${t.practitioner_id}`}>{name(t)}</Link></td>
                      <td className="px-4 py-3">{start ? formatIST(start) : <Badge tone="warning">Waiting for applicant to pick a time</Badge>}</td>
                      <td className="px-4 py-3 text-right">
                        {start && (open ? (
                          <Link href={`/trials/${t.id}/call`} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-semibold text-white">Join call</Link>
                        ) : (
                          <Button disabled className="!h-9">Join call</Button>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <Card className="!p-0">
            <table className="w-full text-left text-sm">
              <caption className="px-4 pt-4 text-left font-semibold">Past</caption>
              <tbody className="divide-y divide-line">
                {past.length === 0 && <tr><td className="px-4 py-3 text-muted">No past calls.</td></tr>}
                {past.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3">{name(t)}</td>
                    <td className="px-4 py-3">{t.scheduled_at ? formatIST(new Date(t.scheduled_at)) : '—'}</td>
                    <td className="px-4 py-3"><Badge tone={t.status === 'completed' ? 'success' : 'warning'}>{t.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
