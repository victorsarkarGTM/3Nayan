'use client';

import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { startDigilocker, verifyBank, verifyPan } from '@3nayan/client';
import { KYC_MAX_ATTEMPTS_PER_24H } from '@3nayan/shared';
import { Alert, Button, Card, Field, TextInput } from '@/components/ui';
import { fieldErrors, messageFor } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { StepActions } from './StepActions';
import type { KycRow } from './useApplication';
import type { StepProps } from './Wizard';

type Address = { street1: string; street2: string; city: string; state: string; pincode: string };

function KycStatus({ row, kind }: { row?: KycRow; kind: string }) {
  const [now] = useState(() => Date.now());
  const recent = (row?.attempt_times ?? []).filter((t) => now - new Date(t).getTime() < 86_400_000).length;
  const left = Math.max(KYC_MAX_ATTEMPTS_PER_24H - recent, 0);
  let body: ReactNode = null;
  if (row?.status === 'passed') body = <span className="text-success">✓ Verified{row.masked_ref ? ` · ${row.masked_ref}` : ''}</span>;
  else if (row?.status === 'flagged') body = <span className="text-warning">Verified · names differ slightly, our team will review this</span>;
  else if (row?.status === 'failed')
    body = <span className="text-danger">Couldn’t verify. Check the details and try again ({left} {left === 1 ? 'attempt' : 'attempts'} left today).</span>;
  return (
    <p data-testid={`kyc-${kind}`} className="text-sm" aria-live="polite">
      {body}
    </p>
  );
}

export function Step5({ ctx, onContinue }: StepProps) {
  const params = useSearchParams();
  const init = (ctx.app?.snapshot?.step5 ?? {}) as { email?: string; gstin?: string; residentialAddress?: Partial<Address> };
  const fromInPerson = (ctx.app?.snapshot?.step2 as { inPerson?: { addressFull?: string; city?: string; pincode?: string } })?.inPerson;
  const [email, setEmail] = useState(init.email ?? '');
  const [gstin, setGstin] = useState(init.gstin ?? '');
  const [addr, setAddr] = useState<Address>({
    street1: init.residentialAddress?.street1 ?? fromInPerson?.addressFull ?? '',
    street2: init.residentialAddress?.street2 ?? '',
    city: init.residentialAddress?.city ?? fromInPerson?.city ?? '',
    state: init.residentialAddress?.state ?? '',
    pincode: init.residentialAddress?.pincode ?? fromInPerson?.pincode ?? '',
  });
  const [pan, setPan] = useState('');
  const [account, setAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [kycBusy, setKycBusy] = useState<string | null>(null);
  const [kycError, setKycError] = useState<string | null>(params.get('kyc') === 'error' ? 'DigiLocker verification didn’t complete. Please try again.' : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const row = (k: string) => ctx.checks.find((c) => c.kind === k);

  const toData = (e: string, a: Address, g: string) => ({
    email: e,
    residentialAddress: { ...a, street2: a.street2 || undefined },
    gstin: g.trim() ? g.trim().toUpperCase() : undefined,
  });
  const draft = (e: string, a: Address, g: string) => (setErrors({}), ctx.saveDraft(5, toData(e, a, g)));

  async function runKyc(kind: string, fn: () => Promise<unknown>) {
    setKycBusy(kind);
    setKycError(null);
    try {
      await fn();
      await ctx.refresh();
    } catch (e) {
      setKycError(messageFor(e));
    } finally {
      setKycBusy(null);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await ctx.saveFull(5, toData(email, addr, gstin));
      const done = ['pan', 'aadhaar', 'bank'].every((k) => ['passed', 'flagged'].includes(row(k)?.status ?? ''));
      if (!done) setError('Your details are saved. Complete all three verifications to finish this step.');
      else onContinue();
    } catch (err) {
      setErrors(fieldErrors(err));
      setError('Some details need another look.');
    } finally {
      setBusy(false);
    }
  }

  const addrField = (key: keyof Address, label: string, autoComplete: string) => (
    <Field label={label} error={errors[`residentialAddress.${key}`]}>
      {(id, d) => (
        <TextInput id={id} aria-describedby={d} autoComplete={autoComplete} value={addr[key]} invalid={!!errors[`residentialAddress.${key}`]}
          onChange={(e) => {
            const a = { ...addr, [key]: e.target.value };
            setAddr(a);
            draft(email, a, gstin);
          }} />
      )}
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold">Contact and address</h2>
        <p className="text-sm text-muted">Used for your payout account and invoices. Never shown to seekers.</p>
        <Field label="Email" error={errors.email}>
          {(id, d) => <TextInput id={id} aria-describedby={d} type="email" autoComplete="email" value={email} invalid={!!errors.email} onChange={(e) => (setEmail(e.target.value), draft(e.target.value, addr, gstin))} />}
        </Field>
        {addrField('street1', 'Address line 1', 'address-line1')}
        {addrField('street2', 'Address line 2 (optional)', 'address-line2')}
        <div className="grid gap-4 sm:grid-cols-3">
          {addrField('city', 'City', 'address-level2')}
          {addrField('state', 'State', 'address-level1')}
          {addrField('pincode', 'PIN code', 'postal-code')}
        </div>
        <Field label="GSTIN (optional)" error={errors.gstin}>
          {(id, d) => <TextInput id={id} aria-describedby={d} value={gstin} invalid={!!errors.gstin} onChange={(e) => (setGstin(e.target.value), draft(email, addr, e.target.value))} />}
        </Field>
      </Card>

      <Card className="flex flex-col gap-5">
        <div>
          <h2 className="font-semibold">Identity and bank verification</h2>
          <p className="mt-1 text-sm text-muted">
            We verify these with secure government and bank checks. We never store your full Aadhaar number.
          </p>
        </div>
        {kycError && <Alert tone="danger">{kycError}</Alert>}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <Field label="PAN">
                {(id) => <TextInput id={id} value={pan} maxLength={10} onChange={(e) => setPan(e.target.value.toUpperCase())} />}
              </Field>
            </div>
            <Button type="button" variant="secondary" busy={kycBusy === 'pan'} onClick={() => runKyc('pan', () => verifyPan(supabase(), pan))}>
              Verify PAN
            </Button>
          </div>
          <KycStatus row={row('pan')} kind="pan" />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Aadhaar</p>
          <div>
            <Button type="button" variant="secondary" busy={kycBusy === 'aadhaar'}
              onClick={() => runKyc('aadhaar', async () => {
                await ctx.flushDraft();
                const { url } = await startDigilocker(supabase(), 'web');
                window.location.href = url;
              })}>
              Verify with DigiLocker
            </Button>
          </div>
          <KycStatus row={row('aadhaar')} kind="aadhaar" />
        </div>
        <div className="flex flex-col gap-2">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
            <Field label="Account number">
              {(id) => <TextInput id={id} inputMode="numeric" value={account} onChange={(e) => setAccount(e.target.value.replace(/\D/g, ''))} />}
            </Field>
            <Field label="IFSC">
              {(id) => <TextInput id={id} maxLength={11} value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} />}
            </Field>
            <Button type="button" variant="secondary" busy={kycBusy === 'bank'} onClick={() => runKyc('bank', () => verifyBank(supabase(), account, ifsc))}>
              Verify bank account
            </Button>
          </div>
          <KycStatus row={row('bank')} kind="bank" />
        </div>
      </Card>
      <StepActions busy={busy} error={error} />
    </form>
  );
}
