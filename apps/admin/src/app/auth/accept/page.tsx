'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Card, Field, Logo, TextInput } from '@/components/ui';
import { supabase } from '@/lib/supabase';

const MIN_LENGTH = 12;

/**
 * Landing page for staff invitation and password-reset emails. Accepts either link format Supabase
 * can send (#access_token… or ?token_hash=…&type=…), then lets the person choose a password.
 */
export default function AcceptInvitePage() {
  const router = useRouter();
  const [ready, setReady] = useState<'checking' | 'ok' | 'invalid'>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = supabase();
    (async () => {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const query = new URLSearchParams(window.location.search);
      // The browser client may already have exchanged a PKCE ?code= link while initialising.
      let ok = !!(await sb.auth.getSession()).data.session;
      if (ok) {
        /* session from the link is ready */
      } else if (hash.get('access_token') && hash.get('refresh_token')) {
        ok = !(await sb.auth.setSession({ access_token: hash.get('access_token')!, refresh_token: hash.get('refresh_token')! })).error;
      } else if (query.get('token_hash') && query.get('type')) {
        const type = query.get('type') as 'invite' | 'recovery';
        ok = !(await sb.auth.verifyOtp({ token_hash: query.get('token_hash')!, type })).error;
      } else if (query.get('code')) {
        ok = !(await sb.auth.exchangeCodeForSession(query.get('code')!)).error;
      }
      window.history.replaceState(null, '', '/auth/accept');
      setReady(ok ? 'ok' : 'invalid');
    })();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters`);
    if (password !== confirm) return setError('The two passwords don’t match');
    setBusy(true);
    setError(null);
    const sb = supabase();
    const { error: err } = await sb.auth.updateUser({ password });
    if (err) {
      setBusy(false);
      return setError('We couldn’t set your password. The link may have expired — ask a super-admin to send a new one.');
    }
    await sb.auth.signOut();
    router.replace('/login?password=set');
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <Logo href="/login" suffix="Admin" />
        <h1 className="mt-4 text-2xl font-semibold">Choose your password</h1>
      </div>
      <Card>
        {ready === 'checking' && <p className="text-sm text-muted">Checking your link…</p>}
        {ready === 'invalid' && (
          <Alert tone="danger">This link has expired or was already used. Use “Forgot password?” on the sign-in page, or ask a super-admin to invite you again.</Alert>
        )}
        {ready === 'ok' && (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <Field label="New password" hint={`At least ${MIN_LENGTH} characters`}>
              {(id, d) => <TextInput id={id} aria-describedby={d} type="password" autoComplete="new-password" value={password} onChange={(e) => (setPassword(e.target.value), setError(null))} />}
            </Field>
            <Field label="Confirm password" error={error}>
              {(id, d) => <TextInput id={id} aria-describedby={d} type="password" autoComplete="new-password" value={confirm} onChange={(e) => (setConfirm(e.target.value), setError(null))} />}
            </Field>
            <Button type="submit" busy={busy}>Set password</Button>
          </form>
        )}
      </Card>
    </main>
  );
}
