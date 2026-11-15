'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  getMyApplication,
  getMyStatusHistory,
  getMyTrial,
  reapply,
  requestTrialReschedule,
  selectTrialSlot,
} from '@3nayan/client';
import { formatIST, isWithinJoinWindow } from '@3nayan/shared';
import { AppShell } from '@/components/AppShell';
import { Alert, Button, Card } from '@/components/ui';
import { messageFor } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

type Trial = Awaited<ReturnType<typeof getMyTrial>>;
type History = Awaited<ReturnType<typeof getMyStatusHistory>>;

const linkButton = 'inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover';

export default function StatusPage() {
  const [status, setStatus] = useState<string | null | undefined>(undefined);
  const [reapplyAfter, setReapplyAfter] = useState<string | null>(null);
  const [history, setHistory] = useState<History>([]);
  const [trial, setTrial] = useState<Trial>(null);
  const [slot, setSlot] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    const sb = supabase();
    const [a, h, t] = await Promise.all([getMyApplication(sb), getMyStatusHistory(sb), getMyTrial(sb)]);
    setStatus(a.practitioner?.status ?? null);
    setReapplyAfter(a.practitioner?.reapply_after ?? null);
    setHistory(h);
    setTrial(t);
  }, []);

  useEffect(() => {
    Promise.resolve().then(load);
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  const reasonFor = (action: string) => history.find((h) => h.action === action)?.reason;
  const canReapply = status === 'rejected' && (!reapplyAfter || new Date(reapplyAfter) <= now);

  let body: React.ReactNode = <p className="text-sm text-muted">Loading…</p>;
  if (status === null || status === 'draft') {
    body = (
      <Card>
        <h2 className="text-lg font-semibold">{status === 'draft' ? 'Continue your application' : 'Become a practitioner'}</h2>
        <p className="mt-2 text-sm text-muted">Six short steps: about you, formats, credentials, a video intro, verification and the agreement.</p>
        <Link href="/practitioner/apply/1" className={`${linkButton} mt-4`}>
          {status === 'draft' ? 'Continue application' : 'Start application'}
        </Link>
      </Card>
    );
  } else if (status === 'submitted' || (status === 'in_review' && trial?.status !== 'proposed')) {
    body = (
      <Card>
        <h2 className="text-lg font-semibold">Application submitted</h2>
        <p className="mt-2 text-sm text-muted">Thank you. Our team is reviewing your application and will contact you by SMS and WhatsApp.</p>
      </Card>
    );
  } else if (status === 'changes_requested') {
    body = (
      <Card>
        <h2 className="text-lg font-semibold">A few changes needed</h2>
        <Alert tone="warning">{reasonFor('request_changes') ?? 'Please review your application.'}</Alert>
        <Link href="/practitioner/apply/1" className={`${linkButton} mt-4`}>
          Update application
        </Link>
      </Card>
    );
  } else if (status === 'in_review' && trial?.status === 'proposed') {
    body = (
      <Card>
        <h2 className="text-lg font-semibold">Pick a time for your trial call</h2>
        <p className="mt-2 text-sm text-muted">A 30-minute video call with our team, inside the 3Nayan app. Times are in IST.</p>
        <fieldset className="mt-4 flex flex-col gap-2">
          <legend className="sr-only">Available times</legend>
          {trial.proposed_slots.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input type="radio" name="slot" value={s} checked={slot === s} onChange={() => setSlot(s)} />
              {formatIST(new Date(s))}
            </label>
          ))}
        </fieldset>
        <Button className="mt-4" disabled={!slot} busy={busy} onClick={() => act(() => selectTrialSlot(supabase(), trial.id, slot))}>
          Confirm this time
        </Button>
      </Card>
    );
  } else if (status === 'trial_scheduled' && trial?.scheduled_at) {
    const start = new Date(trial.scheduled_at);
    const open = isWithinJoinWindow(start, now);
    body = (
      <Card>
        <h2 className="text-lg font-semibold">Your trial call is on {formatIST(start)}</h2>
        <p className="mt-2 text-sm text-muted">The Join button opens 10 minutes before the start time.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {open ? (
            <Link href={`/practitioner/trial/${trial.id}`} className={linkButton}>
              Join call
            </Link>
          ) : (
            <Button disabled>Join call</Button>
          )}
          {!trial.reschedule_used && (
            <Button variant="secondary" busy={busy} onClick={() => act(() => requestTrialReschedule(supabase(), trial.id))}>
              Request a different time
            </Button>
          )}
        </div>
      </Card>
    );
  } else if (status === 'approved') {
    body = (
      <Card>
        <h2 className="text-lg font-semibold">You’re approved</h2>
        <p className="mt-2 text-sm text-muted">Welcome to 3Nayan. We’ll let you know when you can add services and open your calendar.</p>
      </Card>
    );
  } else if (status === 'rejected') {
    body = (
      <Card>
        <h2 className="text-lg font-semibold">We couldn’t approve your application this time</h2>
        {reasonFor('reject') && <Alert tone="info">{reasonFor('reject')}</Alert>}
        {canReapply ? (
          <Button className="mt-4" busy={busy} onClick={() => act(() => reapply(supabase()))}>
            Start a new application
          </Button>
        ) : (
          reapplyAfter && <p className="mt-3 text-sm text-muted">You can apply again from {formatIST(new Date(reapplyAfter)).replace(/, \d+:\d+ [ap]m IST$/, '')}.</p>
        )}
      </Card>
    );
  } else if (status === 'suspended') {
    body = (
      <Card>
        <h2 className="text-lg font-semibold">Your account is suspended</h2>
        <p className="mt-2 text-sm text-muted">Please contact 3Nayan support for details.</p>
      </Card>
    );
  }

  return (
    <AppShell>
      <h1 className="mb-6 text-2xl font-semibold">Your practitioner application</h1>
      {error && <Alert tone="danger">{error}</Alert>}
      {body}
    </AppShell>
  );
}
