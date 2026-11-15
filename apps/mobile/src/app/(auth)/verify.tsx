import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Button, Card, Field, H1, Muted, Screen } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function Verify() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { refresh } = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify() {
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code we sent you');
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ phone: String(phone), token: code, type: 'sms' });
    if (err) {
      setBusy(false);
      return setError('That code didn’t work. Check it, or request a new one.');
    }
    await refresh();
  }

  return (
    <Screen>
      <H1>Enter your code</H1>
      <Muted>Sent to {String(phone).replace('+91', '+91 ')}</Muted>
      <Card>
        <Field label="6-digit code" error={error} keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" maxLength={6}
          value={code} onChangeText={(t) => (setCode(t.replace(/\D/g, '')), setError(null))} testID="otp-input" />
        <Button label="Verify" onPress={verify} busy={busy} testID="verify" />
        <Button label="Change number" variant="secondary" onPress={() => router.back()} />
      </Card>
    </Screen>
  );
}
