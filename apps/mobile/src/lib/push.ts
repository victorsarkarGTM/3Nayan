import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
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
  await supabase
    .from('device_tokens')
    .upsert({ user_id: userId, expo_token: token, platform: Platform.OS === 'ios' ? 'ios' : 'android', last_seen_at: new Date().toISOString() }, { onConflict: 'expo_token' });
}
