import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { ensureCallPermissions } from '@/lib/permissions';
import { color } from '@/theme';

/**
 * Minimal 100ms call on the core React Native SDK (local + remote video, mute, camera, leave).
 * The SDK is required lazily so test builds and JS bundling never load its native module.
 * NOTE: verify on a device with real 100ms keys before launch (no emulator in CI).
 */
export function CallRoom({ token, userName, onLeave }: { token: string; userName: string; onLeave: () => void }) {
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
  const sdk = useRef<any>(null);
  const hms = useRef<any>(null);
  const [tracks, setTracks] = useState<{ local?: string; remote?: string }>({});
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!(await ensureCallPermissions())) {
          setError('3Nayan needs camera and microphone access for the call. Allow them in Settings, then join again.');
          return;
        }
        hms.current = require('@100mslive/react-native-hms');
        const { HMSSDK, HMSConfig, HMSUpdateListenerActions, HMSTrackUpdate } = hms.current;
        const instance = await HMSSDK.build();
        if (cancelled) return;
        sdk.current = instance;
        instance.addEventListener(HMSUpdateListenerActions.ON_TRACK_UPDATE, ({ peer, track, type }: any) => {
          if (track?.type !== 'VIDEO') return;
          const key = peer?.isLocal ? 'local' : 'remote';
          setTracks((t) => ({ ...t, [key]: type === HMSTrackUpdate.TRACK_REMOVED ? undefined : track.trackId }));
        });
        instance.addEventListener(HMSUpdateListenerActions.ON_ERROR, () => setError('The call connection had a problem. Leave and join again.'));
        await instance.join(new HMSConfig({ authToken: token, username: userName }));
      } catch {
        setError('We couldn’t start the call. Check camera and microphone permissions, then try again.');
      }
    })();
    return () => {
      cancelled = true;
      sdk.current?.leave().catch(() => {}).finally(() => sdk.current?.destroy?.());
    };
  }, [token, userName]);

  const View100 = sdk.current?.HmsView;
  const local = () => sdk.current?.localPeer;
  return (
    <SafeAreaView style={s.root}>
      <View style={s.stage}>
        {View100 && tracks.remote ? <View100 trackId={tracks.remote} style={s.fill} /> : <Text style={s.waiting}>Waiting for the other person to join…</Text>}
        {View100 && tracks.local && <View100 trackId={tracks.local} mirror style={s.pip} />}
      </View>
      {error && <Text style={s.error}>{error}</Text>}
      <View style={s.controls}>
        <Button label={micOn ? 'Mute' : 'Unmute'} variant="secondary" onPress={() => { local()?.localAudioTrack()?.setMute(micOn); setMicOn(!micOn); }} />
        <Button label={camOn ? 'Camera off' : 'Camera on'} variant="secondary" onPress={() => { local()?.localVideoTrack()?.setMute(camOn); setCamOn(!camOn); }} />
        <Button label="Leave call" variant="danger" onPress={() => { sdk.current?.leave().finally(onLeave); }} />
      </View>
    </SafeAreaView>
  );
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fill: StyleSheet.absoluteFill,
  pip: { position: 'absolute', right: 16, bottom: 16, width: 110, height: 160, borderRadius: 12, overflow: 'hidden' },
  waiting: { color: '#fff', fontSize: 15 },
  error: { color: color.danger, textAlign: 'center', padding: 8, backgroundColor: color['danger-soft'] },
  controls: { flexDirection: 'row', gap: 8, padding: 16, justifyContent: 'center', flexWrap: 'wrap' },
});
