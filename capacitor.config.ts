import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Registered in the Apple Developer portal under the owner's Team (v2 spec
  // §7.4). Changing it means re-running `npx cap sync ios` and editing
  // PRODUCT_BUNDLE_IDENTIFIER in ios/App/App.xcodeproj to match.
  appId: 'com.bradner.tessera',
  appName: 'Tessera',
  webDir: 'dist',
  // --mat-void, so the web view never flashes white before theme.css lands.
  backgroundColor: '#0B0D10',
  // The web view itself never scrolls or bounces: the board pans through its
  // own camera, and a rubber-banding page reads as the board shaking.
  ios: { scrollEnabled: false },
};

export default config;
