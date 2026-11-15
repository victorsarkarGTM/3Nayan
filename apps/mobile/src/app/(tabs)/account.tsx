import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { getMyProfile, requestAccountDeletion, updateMyProfile } from '@3nayan/client';
import { Button, Card, Field, H1, Muted, Notice, Screen } from '@/components/ui';
import { messageForError } from '@/lib/errors';
import { signOut } from '@/lib/push';
import { supabase } from '@/lib/supabase';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://3nayan.in';

export default function Account() {
  const [name, setName] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  useFocusEffect(useCallback(() => {
    getMyProfile(supabase).then((p) => setName(p?.full_name ?? ''));
  }, []));

  async function save() {
    try {
      await updateMyProfile(supabase, { fullName: name });
      setNotice({ tone: 'success', text: 'Saved.' });
    } catch (e) {
      setNotice({ tone: 'danger', text: messageForError(e) });
    }
  }

  function confirmDeletion() {
    Alert.alert('Delete your 3Nayan account?', 'This can’t be undone once our team processes it.', [
      { text: 'Keep my account', style: 'cancel' },
      {
        text: 'Delete my account', style: 'destructive',
        onPress: async () => {
          try {
            await requestAccountDeletion(supabase);
            setNotice({ tone: 'success', text: 'Your deletion request has been received. We’ll confirm by SMS once it’s done.' });
          } catch (e) {
            setNotice({ tone: 'danger', text: messageForError(e) });
          }
        },
      },
    ]);
  }

  return (
    <Screen>
      <H1>Account</H1>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <Card>
        <Field label="Full name" value={name} onChangeText={setName} />
        <Button label="Save changes" onPress={save} />
      </Card>
      <Card>
        <Button label="Become a practitioner or view your application" variant="secondary" onPress={() => router.push('/practitioner/status')} />
        <Button label="Terms of Use" variant="secondary" onPress={() => Linking.openURL(`${WEB_URL}/legal/terms`)} />
        <Button label="Privacy Policy" variant="secondary" onPress={() => Linking.openURL(`${WEB_URL}/legal/privacy`)} />
      </Card>
      <Card>
        <Muted>We’ll remove your personal details. Records the law requires us to keep are retained.</Muted>
        <Button label="Request account deletion" variant="secondary" onPress={confirmDeletion} />
        <Button label="Sign out" variant="secondary" onPress={() => signOut()} />
      </Card>
    </Screen>
  );
}
