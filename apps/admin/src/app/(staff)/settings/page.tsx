'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { getSettings, updateSettings } from '@3nayan/client';
import { Alert, Button, Card, Field, TextInput } from '@/components/ui';
import { messageFor } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

const LEGAL = [
  ['terms', 'Terms of Use version'],
  ['privacy', 'Privacy Policy version'],
  ['practitioner_agreement', 'Practitioner Agreement version'],
] as const;

export default function SettingsPage() {
  const [percent, setPercent] = useState('');
  const [legal, setLegal] = useState<Record<string, string>>({});
  const [commissionMsg, setCommissionMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [legalMsg, setLegalMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSettings(supabase()).then((s) => {
      setPercent(String((s.commission_rate?.bps ?? 0) / 100));
      setLegal(s.legal_versions ?? {});
      setLoaded(true);
    });
  }, []);

  async function saveCommission(e: FormEvent) {
    e.preventDefault();
    const n = Number(percent);
    if (!Number.isFinite(n) || n < 0 || n > 50 || Math.round(n * 100) !== n * 100)
      return setCommissionMsg({ tone: 'danger', text: 'Enter a commission between 0% and 50% (up to two decimals)' });
    try {
      await updateSettings(supabase(), 'commission_rate', { bps: Math.round(n * 100) });
      setCommissionMsg({ tone: 'success', text: 'Commission saved' });
    } catch (err) {
      setCommissionMsg({ tone: 'danger', text: messageFor(err) });
    }
  }

  async function saveLegal(e: FormEvent) {
    e.preventDefault();
    if (LEGAL.some(([k]) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(legal[k] ?? '')))
      return setLegalMsg({ tone: 'danger', text: 'Each version needs letters, numbers, dots or dashes (e.g. v2 or 2026-12).' });
    try {
      await updateSettings(supabase(), 'legal_versions', legal);
      setLegalMsg({ tone: 'success', text: 'Legal versions saved' });
    } catch (err) {
      setLegalMsg({ tone: 'danger', text: messageFor(err) });
    }
  }

  if (!loaded) return <p className="text-sm text-muted">Loading…</p>;
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Card>
        <form onSubmit={saveCommission} className="flex flex-col gap-4">
          <h2 className="font-semibold">Platform commission</h2>
          <p className="text-sm text-muted">Applied to bookings from Phase 3. Existing bookings keep the rate they were booked at.</p>
          <div className="w-40">
            <Field label="Commission (%)">{(id) => <TextInput id={id} inputMode="decimal" value={percent} onChange={(e) => (setPercent(e.target.value), setCommissionMsg(null))} />}</Field>
          </div>
          {commissionMsg && <Alert tone={commissionMsg.tone}>{commissionMsg.text}</Alert>}
          <div><Button type="submit">Save commission</Button></div>
        </form>
      </Card>
      <Card>
        <form onSubmit={saveLegal} className="flex flex-col gap-4">
          <h2 className="font-semibold">Legal document versions</h2>
          <Alert tone="warning">Changing a version asks every user to accept the new document the next time they open 3Nayan.</Alert>
          {LEGAL.map(([k, label]) => (
            <Field key={k} label={label}>
              {(id) => <TextInput id={id} value={legal[k] ?? ''} onChange={(e) => (setLegal({ ...legal, [k]: e.target.value }), setLegalMsg(null))} />}
            </Field>
          ))}
          {legalMsg && <Alert tone={legalMsg.tone}>{legalMsg.text}</Alert>}
          <div><Button type="submit">Save legal versions</Button></div>
        </form>
      </Card>
    </div>
  );
}
