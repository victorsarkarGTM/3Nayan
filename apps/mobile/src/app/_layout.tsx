import { Stack, router, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerPushToken } from '@/lib/push';
import { SessionProvider, useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

function RouteGuard() {
  const { ready, session, onboarded, isStaff } = useSession();
  const segments = useSegments();

  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === '(auth)';
    if (!session) {
      if (!inAuth) router.replace('/login');
      return;
    }
    if (isStaff) {
      supabase.auth.signOut();
      Alert.alert('Staff account', 'Staff accounts sign in through the 3Nayan admin panel, not this app.');
      return;
    }
    if (!onboarded) {
      if (segments[0] !== 'onboarding') router.replace('/onboarding');
      return;
    }
    if (inAuth || segments[0] === 'onboarding') router.replace('/home');
  }, [ready, session, onboarded, isStaff, segments]);

  useEffect(() => {
    if (session && onboarded && !isStaff) registerPushToken(session.user.id).catch(() => {});
  }, [session, onboarded, isStaff]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <RouteGuard />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
