import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { getMyApplication, getMyStatusHistory, getMyTrial, reapply, requestTrialReschedule, selectTrialSlot } from '@3nayan/client';
import { formatIST, isWithinJoinWindow } from '@3nayan/shared';
import { Button, Card, Checkbox, H1, Muted, Notice, Screen } from '@/components/ui';
import { messageForError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

type Trial = Awaited<ReturnType<typeof getMyTrial>>;
type History = Awaited<ReturnType<typeof getMyStatusHistory>>;

export default function Status() {
  const [status, setStatus] = useState<string | null | undefined>(undefined);
  const [reapplyAfter, setReapplyAfter] = useState<string | null>(null);
  const [history, setHistory] = useState<History>([]);
  const [trial, setTrial] = useState<Trial>(null);
  const [slot, setSlot] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    const [a, h, t] = await Promise.all([getMyApplication(supabase), getMyStatusHistory(supabase), getMyTrial(supabase)]);
    setStatus(a.practitioner?.status ?? null);
    setReapplyAfter(a.practitioner?.reapply_after ?? null);
    setHistory(h);
    setTrial(t);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(messageForError(e)); } finally { setBusy(false); }
  }
  const reason = (action: string) => history.find((h) => h.action === action)?.reason;
  const title = (t: string) => <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: '600' }}>{t}</Text>;

  let body: React.ReactNode = <Muted>Loading…</Muted>;
  if (status === null || status === 'draft') {
    body = <Card>{title(status === 'draft' ? 'Continue your application' : 'Become a practitioner')}<Muted>Six short steps: about you, formats, credentials, a video intro, verification and the agreement.</Muted><Button label={status === 'draft' ? 'Continue application' : 'Start application'} onPress={() => router.push('/apply/1')} /></Card>;
  } else if (status === 'submitted' || (status === 'in_review' && trial?.status !== 'proposed')) {
    body = <Card>{title('Application submitted')}<Muted>Thank you. Our team is reviewing your application and will contact you by SMS and WhatsApp.</Muted></Card>;
  } else if (status === 'changes_requested') {
    body = <Card>{title('A few changes needed')}<Notice tone="warning">{reason('request_changes') ?? 'Please review your application.'}</Notice><Button label="Update application" onPress={() => router.push('/apply/1')} /></Card>;
  } else if (status === 'in_review' && trial?.status === 'proposed') {
    body = (
      <Card>
        {title('Pick a time for your trial call')}
        <Muted>A 30-minute video call with our team, inside the app. Times are in IST.</Muted>
        {trial.proposed_slots.map((s) => <Checkbox key={s} checked={slot === s} onChange={() => setSlot(s)} label={formatIST(new Date(s))} />)}
        <Button label="Confirm this time" disabled={!slot} busy={busy} onPress={() => act(() => selectTrialSlot(supabase, trial.id, slot))} testID="confirm-slot" />
      </Card>
    );
  } else if (status === 'trial_scheduled' && trial?.scheduled_at) {
    const start = new Date(trial.scheduled_at);
    const open = isWithinJoinWindow(start, now);
    body = (
      <Card>
        {title(`Your trial call is on ${formatIST(start)}`)}
        <Muted>The Join button opens 10 minutes before the start time.</Muted>
        <Button label="Join call" disabled={!open} onPress={() => router.push(`/trial/${trial.id}`)} />
        {!trial.reschedule_used && <Button label="Request a different time" variant="secondary" busy={busy} onPress={() => act(() => requestTrialReschedule(supabase, trial.id))} />}
      </Card>
    );
  } else if (status === 'approved') {
    body = <Card>{title('You’re approved')}<Muted>Welcome to 3Nayan. We’ll let you know when you can add services and open your calendar.</Muted></Card>;
  } else if (status === 'rejected') {
    const can = !reapplyAfter || new Date(reapplyAfter) <= now;
    body = (
      <Card>
        {title('We couldn’t approve your application this time')}
        {reason('reject') && <Notice>{reason('reject')}</Notice>}
        {can ? <Button label="Start a new application" busy={busy} onPress={() => act(() => reapply(supabase))} />
          : reapplyAfter && <Muted>You can apply again from {formatIST(new Date(reapplyAfter)).replace(/, \d+:\d+ [ap]m IST$/, '')}.</Muted>}
      </Card>
    );
  } else if (status === 'suspended') {
    body = <Card>{title('Your account is suspended')}<Muted>Please contact 3Nayan support for details.</Muted></Card>;
  }
  return (
    <Screen>
      <H1>Your practitioner application</H1>
      {error && <Notice tone="danger">{error}</Notice>}
      {body}
    </Screen>
  );
}
