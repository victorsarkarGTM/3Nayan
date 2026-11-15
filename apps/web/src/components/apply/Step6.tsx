'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { submitApplication } from '@3nayan/client';
import { AGREEMENT_DECLARATION } from '@3nayan/shared';
import { Alert, Button, Card } from '@/components/ui';
import { messageFor } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { STEP_TITLES, type StepProps } from './Wizard';

export function Step6({ ctx }: StepProps) {
  const router = useRouter();
  const init = (ctx.app?.snapshot?.step6 ?? {}) as { agreementVersion?: string; declarationAccepted?: boolean };
  const alreadyAccepted = init.declarationAccepted === true && init.agreementVersion === ctx.agreementVersion;
  const [declared, setDeclared] = useState(alreadyAccepted);
  const [accepted, setAccepted] = useState(alreadyAccepted);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const completeness = ctx.app?.completeness;
  const incomplete = completeness ? ([1, 2, 3, 4, 5, 6] as const).filter((n) => !completeness.steps[n]) : [];

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!declared || !accepted) return setError('Please confirm both statements to continue.');
    setBusy(true);
    setError(null);
    try {
      await ctx.saveFull(6, { agreementVersion: ctx.agreementVersion, declarationAccepted: true });
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await submitApplication(supabase());
      router.push('/practitioner/status');
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={save} noValidate>
        <Card className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Read the{' '}
            <Link href="/legal/practitioner-agreement" target="_blank" className="text-primary underline">
              Practitioner Agreement
            </Link>{' '}
            (version {ctx.agreementVersion}).
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={declared} onChange={(e) => (setDeclared(e.target.checked), setError(null))} />
            {AGREEMENT_DECLARATION}
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={accepted} onChange={(e) => (setAccepted(e.target.checked), setError(null))} />
            I accept the Practitioner Agreement
          </label>
          <div>
            <Button type="submit" variant="secondary" busy={busy}>
              Save agreement
            </Button>
          </div>
        </Card>
      </form>
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">Submit your application</h2>
        {incomplete.length > 0 ? (
          <p className="text-sm text-muted">
            A few sections still need completing: {incomplete.map((n) => `${n}. ${STEP_TITLES[n]}`).join(', ')}.
          </p>
        ) : (
          <p className="text-sm text-muted">Everything’s ready. Our team will review your application and contact you.</p>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        <div>
          <Button onClick={submit} disabled={incomplete.length > 0} busy={busy}>
            Submit application
          </Button>
        </div>
      </Card>
    </div>
  );
}
