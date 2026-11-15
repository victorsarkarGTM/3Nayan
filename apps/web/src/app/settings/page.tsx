'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getMyProfile, requestAccountDeletion, updateMyProfile } from '@3nayan/client';
import { AppShell } from '@/components/AppShell';
import { Alert, Button, Card, Field, TextInput } from '@/components/ui';
import { messageFor } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export default function SettingsPage() {
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletionRequested, setDeletionRequested] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    getMyProfile(supabase()).then((p) => setName(p?.full_name ?? ''));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await updateMyProfile(supabase(), { fullName: name });
      setSaved(true);
    } catch (err) {
      setError(messageFor(err));
    }
  }

  async function confirmDeletion() {
    try {
      await requestAccountDeletion(supabase());
      setDeletionRequested(true);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      dialog.current?.close();
    }
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="mt-6 grid gap-4">
        <Card>
          <form onSubmit={save} className="flex flex-col gap-4">
            <Field label="Full name">
              {(id) => <TextInput id={id} value={name} onChange={(e) => (setName(e.target.value), setSaved(false))} />}
            </Field>
            {saved && <Alert tone="success">Saved.</Alert>}
            {error && <Alert tone="danger">{error}</Alert>}
            <div>
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        </Card>
        <Card>
          <h2 className="font-semibold">Practitioner</h2>
          <Link href="/practitioner/status" className="mt-2 inline-block text-sm text-primary underline">
            Become a practitioner or view your application
          </Link>
        </Card>
        <Card>
          <h2 className="font-semibold">Delete account</h2>
          <p className="mt-1 text-sm text-muted">
            We’ll remove your personal details. Records the law requires us to keep (such as verification results) are
            retained.
          </p>
          {deletionRequested ? (
            <Alert tone="success">Your deletion request has been received. We’ll confirm by SMS once it’s done.</Alert>
          ) : (
            <Button variant="secondary" className="mt-4" onClick={() => dialog.current?.showModal()}>
              Request account deletion
            </Button>
          )}
        </Card>
      </div>
      <dialog ref={dialog} className="m-auto max-w-sm rounded-lg p-6 backdrop:bg-ink/40">
        <h2 className="font-semibold">Delete your 3Nayan account?</h2>
        <p className="mt-2 text-sm text-muted">This can’t be undone once our team processes it.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => dialog.current?.close()}>
            Keep my account
          </Button>
          <Button variant="danger" onClick={confirmDeletion}>
            Delete my account
          </Button>
        </div>
      </dialog>
    </AppShell>
  );
}
