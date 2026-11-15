/// <reference types="jest" />
import { PermissionsAndroid, Platform } from 'react-native';
import { ensureCallPermissions } from './permissions';

describe('ensureCallPermissions', () => {
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
    Object.defineProperty(Platform, 'Version', { get: () => 34, configurable: true });
  });
  it('asks Android for camera and microphone before a call; true when granted', async () => {
    const spy = jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
      'android.permission.CAMERA': 'granted', 'android.permission.RECORD_AUDIO': 'granted', 'android.permission.BLUETOOTH_CONNECT': 'granted',
    } as never);
    expect(await ensureCallPermissions()).toBe(true);
    expect(spy.mock.calls[0]![0]).toEqual(expect.arrayContaining(['android.permission.CAMERA', 'android.permission.RECORD_AUDIO']));
  });
  it('false when the microphone is denied', async () => {
    jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
      'android.permission.CAMERA': 'granted', 'android.permission.RECORD_AUDIO': 'denied', 'android.permission.BLUETOOTH_CONNECT': 'granted',
    } as never);
    expect(await ensureCallPermissions()).toBe(false);
  });
});
