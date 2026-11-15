'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { StaffRole } from '@3nayan/shared';
import { Alert, Button, Card, Field, Logo, TextInput } from '@/components/ui';
import { landingFor } from '@/lib/roles';
import { supabase } from '@/lib/supabase';

type Step = 'credentials' | 'enrol' | 'verify';

export default function AdminLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [factorId, setFactorId] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [role, setRole] = useState<StaffRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const sb = supabase();
    const { data, error: err } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (err || !data.user) {
      setBusy(false);
      return setError('That email and password don’t match. Check them and try again.');
    }
    const { data: staff } = await sb.from('staff').select('role,active').eq('user_id', data.user.id).maybeSingle();
    if (!staff?.active) {
      await sb.auth.signOut();
      setBusy(false);
      return setError('This account doesn’t have access to the 3Nayan admin panel. Ask a super-admin for an invitation.');
    }
    setRole(staff.role as StaffRole);
    const { data: factors } = await sb.auth.mfa.listFactors();
    const verified = factors?.totp?.find((f) => f.status === 'verified');
    if (verified) {
      setFactorId(verified.id);
      setStep('verify');
    } else {
      for (const f of factors?.all ?? []) if (f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id });
      const { data: enrol, error: enrolErr } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `3Nayan admin ${Date.now()}` });
      if (enrolErr || !enrol) {
        setBusy(false);
        return setError('We couldn’t start two-factor setup. Please try again.');
      }
      setFactorId(enrol.id);
      setQr(enrol.totp.qr_code);
      setSecret(enrol.totp.secret);
      setStep('enrol');
    }
    setBusy(false);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from your authenticator app');
    setBusy(true);
    setError(null);
    const { error: err } = await supabase().auth.mfa.challengeAndVerify({ factorId, code });
    if (err) {
      setBusy(false);
      return setError('That code didn’t work. Check your authenticator app and try again.');
    }
    router.replace(role ? landingFor(role) : '/applications');
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <Logo href="/login" suffix="Admin" />
        <h1 className="mt-4 text-2xl font-semibold">Staff sign in</h1>
      </div>
      <Card>
        {step === 'credentials' ? (
          <form onSubmit={signIn} className="flex flex-col gap-4" noValidate>
            <Field label="Email">
              {(id) => <TextInput id={id} type="email" autoComplete="username" value={email} onChange={(e) => (setEmail(e.target.value), setError(null))} />}
            </Field>
            <Field label="Password">
              {(id) => <TextInput id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => (setPassword(e.target.value), setError(null))} />}
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            <Button type="submit" busy={busy}>
              Sign in
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
            {step === 'enrol' && (
              <div className="flex flex-col items-center gap-3 text-center">
                <p className="text-sm text-muted">
                  Set up two-factor sign-in: scan this code with an authenticator app (Google Authenticator, 1Password, Authy).
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="Two-factor setup QR code" className="h-44 w-44" />
                <p className="text-xs text-muted">
                  Or enter this key: <code data-testid="totp-secret" className="font-mono text-ink">{secret}</code>
                </p>
              </div>
            )}
            <Field label="6-digit code" error={error}>
              {(id, d) => (
                <TextInput id={id} aria-describedby={d} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                  onChange={(e) => (setCode(e.target.value.replace(/\D/g, '')), setError(null))} />
              )}
            </Field>
            <Button type="submit" busy={busy}>
              Verify
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
