# Running Beanie Xchange on a real iPhone

Two paths, easiest first. The app talks to the **production** API
(`https://beaniexchange.com`) by default, so sign-in / browse / listings work
against real data on-device.

---

## Option A — a development build (no App Store, but you do need an Apple account)

**Expo Go no longer runs this app.** It ships a fixed set of native modules and
`@stripe/stripe-react-native`, which native checkout needs, is not among them.
The native tab bar (`expo-router/unstable-native-tabs`) was already degraded
there. Build your own dev client instead — same fast reload, real native
modules:

```bash
cd mobile
npm install
eas build --profile development --platform ios   # simulator build
npx expo start --dev-client
```

The `development` profile in `eas.json` is already set up for this
(`developmentClient: true`, `ios.simulator: true`). For a build that installs
on a physical device rather than the simulator, use `--profile preview`.

---

## Option B — TestFlight (the real, installable app)

This produces the actual native binary with the real native tab bar, app icon,
and everything else — installable via Apple's TestFlight. **This is the goal.**

### One-time prerequisites (yours to set up — I can't do these headlessly)
1. **Apple Developer Program** membership — $99/yr, https://developer.apple.com/programs/
2. A free **Expo account** — https://expo.dev/signup
3. Install the EAS CLI: `npm install -g eas-cli`

### Steps
```bash
cd mobile
eas login                     # sign in to Expo

eas init                      # links this app to an EAS project
                              # (writes extra.eas.projectId into app.json — commit that)

eas build --platform ios --profile production
                              # builds on Expo's servers. It will ask to log in
                              # to Apple and will create the iOS distribution
                              # certificate + provisioning profile for you.

eas submit --platform ios --profile production
                              # uploads the finished build to App Store Connect.
                              # Creates the App Store Connect app record if needed;
                              # needs an App Store Connect API key or an
                              # app-specific Apple password (it walks you through it).
```

Then in **App Store Connect → your app → TestFlight**, add yourself (and any
testers) under Internal Testing. Install the **TestFlight** app on your iPhone,
accept the invite, and the build appears there to install.

### After the first build
- App version lives in `app.json` (`expo.version`); the iOS build number
  auto-increments on EAS (`autoIncrement` + `appVersionSource: "remote"` in
  `eas.json`).
- Re-run `eas build` + `eas submit` for each new TestFlight build.

---

## Config already in place

- **`eas.json`** — `development` (simulator dev client), `preview` (internal
  distribution), and `production` (TestFlight) profiles. Each pins
  `EXPO_PUBLIC_API_URL` to production; change it to point a build at a
  different API.
- **`app.json`** — iOS `bundleIdentifier` = `com.beaniexchange.mobile`,
  Android `package` set, brand splash/icons, and an `ios.infoPlist` carrying
  `ITSAppUsesNonExemptEncryption: false` (without it App Store Connect stops
  every upload on an export-compliance prompt) plus the photo/camera permission
  strings the sell wizard will need. `eas init` adds the project ID.

## Submitting without the prompts

`eas submit` asks for your Apple ID, team, and App Store Connect app id
interactively. That's fine by hand but blocks CI, and only some of it can be
moved into `eas.json`: `appleId`, `ascAppId` and `appleTeamId` must be
**literal values** there — EAS interpolates `$VARS` into `ascApiKeyPath`,
`ascApiKeyIssuerId` and `ascApiKeyId` only. So for unattended submission,
create an App Store Connect API key and add:

```json
"ios": {
  "bundleIdentifier": "com.beaniexchange.mobile",
  "language": "en-US",
  "ascApiKeyPath": "$ASC_API_KEY_PATH",
  "ascApiKeyIssuerId": "$ASC_API_KEY_ISSUER_ID",
  "ascApiKeyId": "$ASC_API_KEY_ID"
}
```

Leave those three out while you're submitting by hand: an unset `$VAR` is
passed through as a literal string, and EAS then fails looking for a key file
actually named `$ASC_API_KEY_PATH`.

## Bundle identifier note
`com.beaniexchange.mobile` is a placeholder-safe reverse-DNS id. If you own a
different Apple Team / prefer another id, change `expo.ios.bundleIdentifier`
in `app.json` **before** the first `eas build` (changing it later means a new
App Store Connect app record).
