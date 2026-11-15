'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { acceptConsents, getLegalVersions, updateMyProfile, uploadAvatar } from '@3nayan/client';
import { Alert, Button, Card, Field, Logo, TextInput } from '@/components/ui';
import { messageFor } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const checkName = () => setNameError(name.trim() ? null : 'Enter your full name');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setNameError('Enter your full name');
    if (!terms || !privacy) return setError('Please accept the Terms of Use and Privacy Policy to continue');
    setBusy(true);
    setError(null);
    try {
      const sb = supabase();
      const photoPath = photo ? (await uploadAvatar(sb, photo)).path : undefined;
      await updateMyProfile(sb, { fullName: name, photoPath });
      const v = await getLegalVersions(sb);
      await acceptConsents(sb, [
        { document: 'terms', version: v.terms },
        { document: 'privacy', version: v.privacy },
      ]);
      router.replace('/home');
      router.refresh();
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <Logo />
        <h1 className="mt-4 text-2xl font-semibold">Welcome to 3Nayan</h1>
        <p className="mt-1 text-sm text-muted">Tell us your name to finish setting up your account.</p>
      </div>
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <Field label="Full name" error={nameError}>
            {(id, d) => (
              <TextInput
                id={id}
                aria-describedby={d}
                autoComplete="name"
                value={name}
                invalid={Boolean(nameError)}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(null);
                }}
                onBlur={checkName}
              />
            )}
          </Field>
          <Field label="Profile photo (optional)" hint="JPG or PNG, up to 5 MB">
            {(id, d) => (
              <input
                id={id}
                aria-describedby={d}
                type="file"
                accept="image/jpeg,image/png"
                className="text-sm"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
            )}
          </Field>
          <div className="flex flex-col gap-3 text-sm">
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" checked={terms} onChange={(e) => (setTerms(e.target.checked), setError(null))} />
              <span>
                I accept the Terms of Use (
                <Link className="text-primary underline" href="/legal/terms" target="_blank">
                  read
                </Link>
                )
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" checked={privacy} onChange={(e) => (setPrivacy(e.target.checked), setError(null))} />
              <span>
                I accept the Privacy Policy (
                <Link className="text-primary underline" href="/legal/privacy" target="_blank">
                  read
                </Link>
                )
              </span>
            </label>
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" busy={busy}>
            Continue
          </Button>
        </form>
      </Card>
    </main>
  );
}
