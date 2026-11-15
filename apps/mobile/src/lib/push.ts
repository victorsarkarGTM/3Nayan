import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/** Ask for notification permission and store this device's Expo push token for the signed-in user. */
export async function registerPushToken(userId: string): Promise<void> {
  if (!Device.isDevice) return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Updates', importance: Notifications.AndroidImportance.DEFAULT });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  // The RPC (re)assigns this device's token to the signed-in user; a plain upsert would need UPDATE rights.
  const { error } = await supabase.rpc('register_device_token', { p_token: token, p_platform: Platform.OS === 'ios' ? 'ios' : 'android' });
  if (error) console.warn('push token registration failed', error.message);
  else await SecureStore.setItemAsync(TOKEN_KEY, token);
  void userId;
}

const TOKEN_KEY = 'push-token';

/** Stop sending this user's notifications to this device (call before signing out). */
export async function unregisterPushToken(): Promise<void> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) return;
  const { error } = await supabase.rpc('unregister_device_token', { p_token: token });
  if (error) console.warn('push token removal failed', error.message);
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/** Sign out, removing this device's push token first. */
export async function signOut(): Promise<void> {
  await unregisterPushToken().catch(() => {});
  await supabase.auth.signOut();
}
