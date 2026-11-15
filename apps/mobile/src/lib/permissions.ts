import { PermissionsAndroid, Platform, type Permission } from 'react-native';

/**
 * Ask for camera + microphone before joining a call. Android needs an explicit runtime request
 * (iOS prompts on first use, using the Info.plist strings in app.config.ts).
 */
export async function ensureCallPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const wanted: Permission[] = [PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (Number(Platform.Version) >= 31) wanted.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  const result = await PermissionsAndroid.requestMultiple(wanted);
  const granted = (p: Permission) => result[p] === PermissionsAndroid.RESULTS.GRANTED;
  return granted(PermissionsAndroid.PERMISSIONS.CAMERA) && granted(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
}
