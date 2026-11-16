import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Registered in the Apple Developer portal under the owner's Team (v2 spec
  // §7.4). Changing it means re-running `npx cap sync ios` and editing
  // PRODUCT_BUNDLE_IDENTIFIER in ios/App/App.xcodeproj to match.
  appId: 'com.johnbradner.tessera',
  appName: 'Tessera',
  webDir: 'dist',
  // --mat-void, so the web view never flashes white before theme.css lands.
  backgroundColor: '#0B0D10',
};

export default config;
