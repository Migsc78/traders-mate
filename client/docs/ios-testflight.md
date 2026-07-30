# iOS TestFlight — TradiesMate (parallel with Android)

Do **Phase 1 on Windows** (browser) as soon as your Apple Developer account is approved.  
Do **Phase 3 on a Mac** with Xcode 15+ for Archive / TestFlight upload.

App ID / bundle: `uk.co.tradiesmate.app`  
Remote shell URL: `https://tradiesmate.co.uk/t` (same as Android)

---

## Already in the repo

- Capacitor iOS project: `client/ios`
- Bundle ID aligned with Capacitor `appId`
- Display name: TradiesMate
- Icons: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (1024×1024)
- Splash: `Splash.imageset` + Capacitor SplashScreen plugin
- Associated Domains entitlements: `applinks:tradiesmate.co.uk` (+ www)
- Info.plist: microphone usage + `ITSAppUsesNonExemptEncryption = false`

---

## Phase 1 — Apple Developer (Windows browser)

### 1A — Register the App ID

1. Open [developer.apple.com/account](https://developer.apple.com/account) → sign in.
2. **Certificates, Identifiers & Profiles** → **Identifiers** → **+**.
3. Choose **App IDs** → Continue.
4. Type: **App** → Continue.
5. Description: `TradiesMate`
6. Bundle ID: **Explicit** → `uk.co.tradiesmate.app`
7. Capabilities: tick **Associated Domains** (required for Universal Links).
8. Continue → Register.

### 1B — Team ID

Configured: **`P9JA3BHGGH`** (in `apple-app-site-association`).

### 1C — App Store Connect

App record created: **TradiesMate** · bundle `uk.co.tradiesmate.app` · SKU `tradiesmate-ios`.  
Listing screenshots / description can wait — TestFlight only needs an Xcode upload.

---

## Phase 2 — Universal Links file (Vercel)

Live file: `client/public/.well-known/apple-app-site-association`

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appIDs": ["P9JA3BHGGH.uk.co.tradiesmate.app"],
        "paths": ["/t", "/t/*"]
      }
    ]
  }
}
```

After push, confirm:

`https://tradiesmate.co.uk/.well-known/apple-app-site-association`

---

## Phase 3 — MacBook + Xcode → TestFlight

```bash
cd /path/to/traders-mate-app/client
git pull
npm install
npm run cap:sync
npm run cap:ios
```

In Xcode:

1. Left sidebar → blue **App** project → **App** target.
2. **Signing & Capabilities**:
   - Team: your Apple Developer team
   - Bundle Identifier: `uk.co.tradiesmate.app`
   - Associated Domains should list `applinks:tradiesmate.co.uk` and `applinks:www.tradiesmate.co.uk`
3. Plug in iPhone, trust computer, select device, press **Run** once.
4. Menu **Product → Archive**.
5. When archive finishes → **Distribute App** → **App Store Connect** → Upload.
6. App Store Connect → **TestFlight** → wait for processing → add internal testers.
7. On iPhone: install **TestFlight** → install TradiesMate.

---

## Day-to-day after first ship

Most product UI ships via the live website (same as Android).  
Rebuild / re-upload iOS only when you change native config, icons, plugins, or version numbers.

```bash
npm run cap:sync
# then Archive again in Xcode
```

Bump `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` in the Xcode App target (or `project.pbxproj`) before each new TestFlight build.

---

## Notes

- Universal Links only open the app after AASA is live with the real Team ID and the device has verified the domain. OTP on `/t/auth` remains the fallback.
- Android and iOS can ship in parallel; they share the same web app and bundle-style ID `uk.co.tradiesmate.app`.
