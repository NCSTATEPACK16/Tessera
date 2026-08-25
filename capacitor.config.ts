import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // PLACEHOLDER — swap for the real reverse-DNS bundle id (tied to the Apple
  // Developer Team) before any TestFlight/App Store upload. Changing it after
  // the Xcode project exists means re-running `npx cap sync ios`.
  appId: 'com.tessera.app',
  appName: 'Tessera',
  webDir: 'dist',
};

export default config;
