import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { getTrialJoinToken } from '@3nayan/client';
import { Button, Card, H1, Muted, Notice, Screen } from '@/components/ui';
import { CallRoom } from '@/components/CallRoom';
import { messageForError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export default function TrialCall() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getTrialJoinToken(supabase, String(id)).then((t) => setToken(t.token)).catch((e) => setError(messageForError(e)));
  }, [id]);

  if (error) return <Screen><Notice tone="danger">{error}</Notice><Button label="Back" variant="secondary" onPress={() => router.back()} /></Screen>;
  if (!token) return <Screen><Muted>Connecting…</Muted></Screen>;
  if (process.env.EXPO_PUBLIC_PROVIDERS === 'fake')
    return <Screen><H1>Trial call (test mode)</H1><Card><Muted>Video is disabled with test providers. Your join token was issued successfully.</Muted></Card></Screen>;
  return <CallRoom token={token} userName="Applicant" onLeave={() => router.replace('/practitioner/status')} />;
}
