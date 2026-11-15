'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { normaliseIndianPhone } from '@3nayan/shared';
import { Alert, Button, Card, Field, Logo, TextInput } from '@/components/ui';
import { supabase } from '@/lib/supabase';

const PHONE_ERROR = 'Enter a valid 10-digit Indian mobile number';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [e164, setE164] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    const normalised = normaliseIndianPhone(phone);
    if (!normalised) return setError(PHONE_ERROR);
    setBusy(true);
    setError(null);
    const { error: err } = await supabase().auth.signInWithOtp({ phone: normalised });
    setBusy(false);
    if (err) {
      return setError(
        err.status === 429
          ? 'You’ve asked for several codes. Please wait a few minutes and try again.'
          : 'We couldn’t send a code right now. Please try again in a minute.',
      );
    }
    setE164(normalised);
    setStep('code');
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code we sent you');
    setBusy(true);
    setError(null);
    const { error: err } = await supabase().auth.verifyOtp({ phone: e164, token: code, type: 'sms' });
    if (err) {
      setBusy(false);
      return setError('That code didn’t work. Check it, or request a new one.');
    }
    router.replace('/home');
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <Logo />
        <h1 className="mt-4 text-2xl font-semibold text-ink">Sign in to 3Nayan</h1>
        <p className="mt-1 text-sm text-muted">We’ll text a one-time code to your mobile number.</p>
      </div>
      {params.get('error') === 'staff' && (
        <Alert tone="warning">Staff accounts sign in through the 3Nayan admin panel, not this app.</Alert>
      )}
      <Card>
        {step === 'phone' ? (
          <form onSubmit={sendCode} className="flex flex-col gap-4" noValidate>
            <Field label="Mobile number" hint="Indian mobile numbers only, e.g. 98765 43210" error={error}>
              {(id, describedBy) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={phone}
                  invalid={Boolean(error)}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setError(null);
                  }}
                  onBlur={() => phone && !normaliseIndianPhone(phone) && setError(PHONE_ERROR)}
                />
              )}
            </Field>
            <Button type="submit" busy={busy}>
              Send code
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
            <p className="text-sm text-muted">
              Code sent to <span className="font-medium text-ink">{e164.replace('+91', '+91 ')}</span>
            </p>
            <Field label="6-digit code" error={error}>
              {(id, describedBy) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  invalid={Boolean(error)}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, ''));
                    setError(null);
                  }}
                />
              )}
            </Field>
            <Button type="submit" busy={busy}>
              Verify
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setStep('phone');
                setCode('');
                setError(null);
              }}
            >
              Change number
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
