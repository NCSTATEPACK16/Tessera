# Testing on iOS, and shipping to TestFlight

The iOS app is the web build inside a Capacitor shell (`ios/`, v2 spec §7.4). Bundle id
`com.bradner.tessera`, display name **Tessera**, store name **Tessera: Photo Jigsaw**.

Capacitor 8 uses Swift Package Manager, so there is no `.xcworkspace` and no Podfile: open
**`ios/App/App.xcodeproj`**, scheme **App**.

Claude can do every step up to and including the simulator. Anything that signs in to Apple,
including choosing the Team, archiving with your certificate, and uploading, is yours to click.

## 0. Every time the web code changes

```bash
npm run build
```

```bash
npx cap sync ios
```

`cap sync` copies `dist/` into `ios/App/App/public` (gitignored) and refreshes the native plugin
list. An Xcode build without it ships whatever web build was synced last.

## 1. Simulator

```bash
npx cap open ios
```

Pick an iPhone or iPad simulator in the toolbar and press **Run** (⌘R). The guided twelve should
appear on a dark background within about two seconds. A white screen means the web view never
loaded: check Xcode's console for lines starting with ⚡️.

Haptics do nothing in the simulator. That is expected, since it has no Taptic Engine.

## 2. Your own iPhone or iPad

1. Plug the device in (or pair it over Wi-Fi), and turn on **Developer Mode** on the device
   (Settings → Privacy & Security → Developer Mode).
2. In Xcode: select the **App** target → **Signing & Capabilities** → set **Team** to your
   developer account. Leave *Automatically manage signing* on. Xcode registers the bundle id
   for you the first time.
3. Choose the device in the toolbar and Run.

Feel the three haptics here, because nowhere else has them: a light tick on pickup, a medium one
when a piece snaps, and heavy plus success on completion. Each one must land on the same frame
as the sound, never after it.

## 3. App Store Connect record (once)

At [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps** → **+** →
**New App**:

| Field | Value |
|---|---|
| Platforms | iOS |
| Name | Tessera: Photo Jigsaw (if it's taken, try a variant; the home-screen name stays "Tessera") |
| Primary language | English (U.S.) |
| Bundle ID | com.bradner.tessera |
| SKU | tessera-ios |

## 4. Archive and upload

1. In the Xcode toolbar, set the destination to **Any iOS Device (arm64)**.
2. Bump the build number: **App** target → **General** → **Build**. It must be higher than every
   build you have uploaded before. The version (**1.0**) only changes for a store release.
3. **Product → Archive.** When it finishes, Organizer opens.
4. **Distribute App → TestFlight & App Store** (or **TestFlight Internal Only** for a build
   only you and your App Store Connect team will see) → **Distribute**.

Export compliance is already answered in `Info.plist` (`ITSAppUsesNonExemptEncryption = NO`, since
the app uses only HTTPS), so the build won't wait on that question.

Processing takes 5–30 minutes. Apple emails you when the build is ready.

## 5. TestFlight

**Internal testing** (you, plus up to 100 people on your App Store Connect team): the build is
available as soon as processing finishes, with no review. Add yourself under **TestFlight →
Internal Testing**, then install the **TestFlight** app on your phone.

**External testing / the public link** (the Reddit beta, v2 spec §8):

1. **TestFlight → Test Information**: the beta app description, a **feedback email**, and a
   **privacy policy URL**. The privacy URL is `/privacy` on the web build, which is slice 3 and
   not built yet. External testing can't start without it.
2. Create an external group, add the build, and submit it for **Beta App Review**. The first
   build usually takes about a day, and later builds are often automatic.
3. Once approved: enable **Public Link** on the group, and set a tester cap if you want one.

Testers send screenshot feedback from inside TestFlight (take a screenshot → Share Beta Feedback).
It shows up under **TestFlight → Feedback**.

## What makes this more than a wrapper

Beta App Review applies guideline 4.2 (minimum functionality). The native features that answer it
(v2 spec §7.4):

- [x] Haptics: pickup, snap, completion (`src/platform/index.ts`)
- [ ] PHPicker for "Your photos" (`@capacitor/camera`)
- [ ] Daily reminder (`@capacitor/local-notifications`)

## Known gaps

- The app icon is the 512px PWA icon upscaled to 1024. That's fine for TestFlight, but replace
  it before a store release.
