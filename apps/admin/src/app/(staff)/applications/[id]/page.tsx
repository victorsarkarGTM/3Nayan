'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { getApplicationDetail } from '@3nayan/client';
import { Badge } from '@/components/ui';
import { ActionBar } from '@/components/review/ActionBar';
import { Notes } from '@/components/review/Notes';
import { ApplicationSections, Timeline, type Detail } from '@/components/review/Sections';
import { messageFor } from '@/lib/errors';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/status';
import { supabase } from '@/lib/supabase';

export default function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setD(await getApplicationDetail(supabase(), id));
    } catch (e) {
      setError(messageFor(e));
    }
  }, [id]);
  useEffect(() => {
    Promise.resolve().then(reload);
  }, [reload]);

  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (!d) return <p className="text-sm text-muted">Loading…</p>;
  const p = d.practitioner;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/applications" className="text-sm text-primary">← Applications</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{p.display_name ?? 'Unnamed applicant'}</h1>
          <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <ApplicationSections d={d} />
        <div className="flex flex-col gap-4">
          <ActionBar d={d} reload={reload} />
          <Timeline d={d} />
          <Notes d={d} onAdded={reload} />
        </div>
      </div>
    </div>
  );
}
