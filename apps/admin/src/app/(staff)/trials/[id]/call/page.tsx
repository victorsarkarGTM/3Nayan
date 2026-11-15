'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { getTrialJoinToken } from '@3nayan/client';
import { Alert, Card } from '@/components/ui';
import { messageFor } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

const HMSPrebuilt = dynamic(() => import('@100mslive/roomkit-react').then((m) => m.HMSPrebuilt), { ssr: false });

export default function ReviewerCallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getTrialJoinToken(supabase(), id).then((t) => setToken(t.token)).catch((e) => setError(messageFor(e)));
  }, [id]);
  if (error)
    return (
      <div className="max-w-lg">
        <Alert tone="danger">{error}</Alert>
        <Link href="/trials" className="mt-4 inline-block text-sm text-primary underline">Back to trial calls</Link>
      </div>
    );
  if (!token) return <p className="text-sm text-muted">Connecting…</p>;
  if (process.env.NEXT_PUBLIC_PROVIDERS === 'fake')
    return (
      <Card className="max-w-lg">
        <h1 className="text-lg font-semibold">Trial call (test mode)</h1>
        <p className="mt-2 text-sm text-muted">Video is disabled with test providers. Your join token was issued successfully.</p>
      </Card>
    );
  return (
    <div className="h-[calc(100dvh-4rem)]">
      <HMSPrebuilt authToken={token} options={{ userName: '3Nayan reviewer' }} />
    </div>
  );
}
