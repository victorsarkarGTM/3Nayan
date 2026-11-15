import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Linking, Text } from 'react-native';
import { acceptConsents, getLegalVersions, updateMyProfile, uploadAvatar } from '@3nayan/client';
import { messageForError } from '@/lib/errors';
import { Button, Card, Checkbox, Field, H1, Muted, Notice, Screen } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { color } from '@/theme';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://3nayan.in';

export default function Onboarding() {
  const { refresh } = useSession();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pickPhoto() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!r.canceled) setPhoto(r.assets[0] ?? null);
  }

  async function submit() {
    if (!name.trim()) return setNameError('Enter your full name');
    if (!terms || !privacy) return setError('Please accept the Terms of Use and Privacy Policy to continue');
    setBusy(true);
    setError(null);
    try {
      let photoPath: string | undefined;
      if (photo) {
        const body = await (await fetch(photo.uri)).arrayBuffer();
        photoPath = (await uploadAvatar(supabase, { type: photo.mimeType ?? 'image/jpeg', size: body.byteLength } as Blob, { body })).path;
      }
      await updateMyProfile(supabase, { fullName: name, photoPath });
      const v = await getLegalVersions(supabase);
      await acceptConsents(supabase, [{ document: 'terms', version: v.terms }, { document: 'privacy', version: v.privacy }]);
      await refresh();
    } catch (e) {
      setError(messageForError(e));
      setBusy(false);
    }
  }

  const link = (path: string, label: string) => (
    <Text style={{ color: color.primary, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(`${WEB_URL}${path}`)}>{label}</Text>
  );
  return (
    <Screen>
      <H1>Welcome to 3Nayan</H1>
      <Muted>Tell us your name to finish setting up your account.</Muted>
      <Card>
        <Field label="Full name" error={nameError} autoComplete="name" value={name} onChangeText={(t) => (setName(t), setNameError(null))}
          onBlur={() => !name.trim() && setNameError('Enter your full name')} testID="name-input" />
        {photo && <Image source={{ uri: photo.uri }} accessibilityLabel="Your profile photo" style={{ width: 72, height: 72, borderRadius: 36 }} />}
        <Button label={photo ? 'Change photo' : 'Add a profile photo (optional)'} variant="secondary" onPress={pickPhoto} />
        <Checkbox checked={terms} onChange={(v) => (setTerms(v), setError(null))} label={<Text>I accept the {link('/legal/terms', 'Terms of Use')}</Text>} />
        <Checkbox checked={privacy} onChange={(v) => (setPrivacy(v), setError(null))} label={<Text>I accept the {link('/legal/privacy', 'Privacy Policy')}</Text>} />
        {error && <Notice tone="danger">{error}</Notice>}
        <Button label="Continue" onPress={submit} busy={busy} testID="continue" />
      </Card>
    </Screen>
  );
}
