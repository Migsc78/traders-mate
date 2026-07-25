# iOS TestFlight prep — TradiesMate

Work from a Mac with Xcode 15+ and an Apple Developer account.

## Already in the repo
- Bundle ID: `uk.co.tradiesmate.app` (aligned with Capacitor `appId`)
- Display name: TradiesMate
- Icons: `ios/App/App/Assets.xcassets/AppIcon.appiconset`
- Splash: `Splash.imageset` + Capacitor SplashScreen plugin
- Associated Domains entitlements: `applinks:tradiesmate.co.uk` (+ www)

## Apple Developer Console
1. Certificates, Identifiers & Profiles → Identifiers → App IDs → register `uk.co.tradiesmate.app`
2. Enable **Associated Domains**
3. Create App Store Connect app with the same bundle ID
4. Replace `TEAMID` in `client/public/.well-known/apple-app-site-association` with your Team ID, then redeploy the website

## Build
```bash
cd client
npm run cap:sync
npm run cap:ios
```
In Xcode: select Team, Archive, Distribute App → App Store Connect → TestFlight.

## Note
Universal Links only open the app after the AASA file is live and the device has verified the domain. OTP on `/t/auth` remains the fallback.
