import { router } from 'expo-router';
import { useState } from 'react';
import { normaliseIndianPhone } from '@3nayan/shared';
import { Button, Card, Field, H1, Muted, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';

const PHONE_ERROR = 'Enter a valid 10-digit Indian mobile number';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    const e164 = normaliseIndianPhone(phone);
    if (!e164) return setError(PHONE_ERROR);
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (err) return setError(err.status === 429 ? 'You’ve asked for several codes. Please wait a few minutes and try again.' : 'We couldn’t send a code right now. Please try again in a minute.');
    router.push({ pathname: '/verify', params: { phone: e164 } });
  }

  return (
    <Screen>
      <H1>Sign in to 3Nayan</H1>
      <Muted>We’ll text a one-time code to your mobile number.</Muted>
      <Card>
        <Field label="Mobile number" hint="Indian mobile numbers only, e.g. 98765 43210" error={error} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber"
          value={phone} onChangeText={(t) => (setPhone(t), setError(null))} onBlur={() => phone && !normaliseIndianPhone(phone) && setError(PHONE_ERROR)} testID="phone-input" />
        <Button label="Send code" onPress={send} busy={busy} testID="send-code" />
      </Card>
    </Screen>
  );
}
