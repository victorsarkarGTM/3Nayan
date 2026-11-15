'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { getTrialJoinToken } from '@3nayan/client';
import { Alert, Card } from '@/components/ui';
import { messageFor } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

// 100ms Prebuilt room, loaded only in the browser and only with real providers.
const HMSPrebuilt = dynamic(() => import('@100mslive/roomkit-react').then((m) => m.HMSPrebuilt), { ssr: false });

export default function TrialCallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fake = process.env.NEXT_PUBLIC_PROVIDERS === 'fake';

  useEffect(() => {
    getTrialJoinToken(supabase(), id)
      .then((t) => setToken(t.token))
      .catch((e) => setError(messageFor(e)));
  }, [id]);

  if (error)
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <Alert tone="danger">{error}</Alert>
        <Link href="/practitioner/status" className="mt-4 inline-block text-sm text-primary underline">
          Back to your application
        </Link>
      </main>
    );
  if (!token) return <p className="p-8 text-sm text-muted">Connecting…</p>;
  if (fake)
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <Card>
          <h1 className="text-lg font-semibold">Trial call (test mode)</h1>
          <p className="mt-2 text-sm text-muted">Video is disabled with test providers. Your join token was issued successfully.</p>
        </Card>
      </main>
    );
  return (
    <div className="h-dvh">
      <HMSPrebuilt authToken={token} options={{ userName: 'Applicant' }} />
    </div>
  );
}
