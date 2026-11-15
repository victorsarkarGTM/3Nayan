import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { getMyApplication, getMyProfile } from '@3nayan/client';
import { Button, Card, H1, Muted, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      getMyProfile(supabase).then((p) => setName(p?.full_name?.split(' ')[0] ?? ''));
      getMyApplication(supabase).then((a) => setStatus(a.practitioner?.status ?? null));
    }, []),
  );
  return (
    <Screen>
      <H1>{name ? `Namaste, ${name}` : 'Namaste'}</H1>
      <Card>
        <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: '600' }}>Booking opens soon</Text>
        <Muted>We’re welcoming verified healers, astrologers and psychics to 3Nayan. You’ll be able to find and book sessions here very soon.</Muted>
      </Card>
      <Card>
        <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: '600' }}>Share your gift</Text>
        <Muted>Are you a healer, astrologer or psychic? Apply to offer sessions on 3Nayan.</Muted>
        <Button label={status ? 'View my application' : 'Become a practitioner'}
          onPress={() => router.push(status ? '/practitioner/status' : '/apply/1')} testID="become-practitioner" />
      </Card>
    </Screen>
  );
}
