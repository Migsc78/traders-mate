# Capacitor shell (tradie app only)

The native apps are a thin WebView over production `https://tradiesmate.co.uk/t`. Desktop and mobile browsers are unchanged — native behaviour is gated on `Capacitor.isNativePlatform()`.

## App identity

| | |
|---|---|
| App ID / package | `uk.co.tradiesmate.app` |
| App name | TradiesMate |
| Remote URL | `https://tradiesmate.co.uk/t` (override with `CAPACITOR_SERVER_URL`) |

## Scripts

From `client/`:

```bash
npm run cap:sync      # build web + npx cap sync
npm run cap:android   # open Android Studio
npm run cap:ios       # open Xcode (macOS)
```

Local WebView against Vite:

```bash
# Android emulator → host machine
set CAPACITOR_SERVER_URL=http://10.0.2.2:5173/t
npm run cap:sync
```

Cleartext HTTP is allowed only when `CAPACITOR_SERVER_URL` is `http://localhost` / `127.0.0.1` (or that pattern). Production builds use HTTPS only.

## Deep links (magic login)

SMS links look like `https://tradiesmate.co.uk/t/auth?token=...`.

- **Android:** App Links intent-filters on `/t` in `AndroidManifest.xml` (`autoVerify=true`).
- **iOS:** Associated Domains `applinks:tradiesmate.co.uk` via `App/App.entitlements`.
- **Hosted:** `public/.well-known/assetlinks.json` and `apple-app-site-association` (served by Vercel with JSON content-type; SPA rewrite excludes `.well-known/`).
- **Runtime:** `NativeAppBootstrap` listens for `appUrlOpen` / launch URL and routes into `/t/...`.

### After creating the Play upload keystore

1. Print the SHA-256 fingerprint:

```bash
keytool -list -v -keystore android/upload-keystore.jks -alias upload
```

2. Replace `REPLACE_WITH_UPLOAD_KEYSTORE_SHA256` in `public/.well-known/assetlinks.json`.
3. Deploy the client so `https://tradiesmate.co.uk/.well-known/assetlinks.json` updates.
4. Verify: `adb shell pm get-app-links uk.co.tradiesmate.app`

### After Apple Developer setup

1. Create App ID `uk.co.tradiesmate.app` with **Associated Domains**.
2. Replace `TEAMID` in `apple-app-site-association` with your 10-character Team ID.
3. Redeploy client; confirm `https://tradiesmate.co.uk/.well-known/apple-app-site-association` returns JSON.

## Android release (Play Internal)

1. Generate an upload keystore (once; keep backups offline):

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore android/upload-keystore.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

2. Copy `android/keystore.properties.example` → `android/keystore.properties` and fill passwords / paths. Both files are gitignored except the example.

3. Sync and build the App Bundle:

```bash
npm run cap:sync
cd android
.\gradlew.bat bundleRelease
```

AAB path: `android/app/build/outputs/bundle/release/app-release.aab`

4. Play Console → **Internal testing** → upload AAB.
5. Store listing basics:
   - Privacy policy: `https://tradiesmate.co.uk/` (or dedicated legal page when available)
   - Screenshots: Jobs, Quotes, Customers from `/t` on a phone
   - Short description: missed-call rescue + quoting for UK trades
6. Add testers’ emails; share the internal testing link.

## iOS / TestFlight (needs Mac + Apple Developer)

1. Open `ios/App/App.xcworkspace` (or `.xcodeproj`) via `npm run cap:ios`.
2. Confirm bundle ID `uk.co.tradiesmate.app`, icons in `Assets.xcassets`, Associated Domains capability.
3. Signing: Automatic + your Team.
4. Archive → Distribute → **TestFlight**.

## Native chrome

- Safe-area padding under `html.native-app` in `tradie.css`
- `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/app` (back + deep links)
- Non-`/t` routes redirect into `/t` only when `isNativeApp()` is true
