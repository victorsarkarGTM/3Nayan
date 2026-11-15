import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: '3Nayan',
  slug: 'threenayan',
  scheme: 'threenayan',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'light',
  ios: { bundleIdentifier: 'in.threenayan.app', supportsTablet: false },
  android: { package: 'in.threenayan.app', adaptiveIcon: { foregroundImage: './assets/images/android-icon-foreground.png', backgroundColor: '#FFFFFF' } },
  plugins: [
    'expo-router',
    'expo-secure-store',
    ['expo-notifications', { color: '#5B4FCF' }],
    ['expo-image-picker', {
      photosPermission: '3Nayan uses your photos so you can add a profile picture and an introduction video.',
      cameraPermission: '3Nayan uses the camera so you can take a profile picture or record your introduction video.',
      microphonePermission: '3Nayan uses the microphone to record your introduction video and for calls.',
    }],
  ],
  experiments: { typedRoutes: false },
  extra: { eas: { projectId: process.env.EAS_PROJECT_ID } },
};

export default config;
