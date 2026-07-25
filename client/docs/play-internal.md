# Play Console checklist — TradiesMate Android (internal testing)

## Package
- Application ID: `uk.co.tradiesmate.app`
- Artifact: AAB from `./gradlew bundleRelease` after `npm run cap:sync`

## Listing (minimum for Internal testing)
- App name: TradiesMate
- Short description: Turn missed calls into quoted jobs for UK trades.
- Full description: Dedicated number, SMS rescue, van quotes, Pay Now, diary and certificates.
- Privacy policy URL: https://tradiesmate.co.uk/
- Category: Business
- Screenshots: capture Jobs, Quotes, Customers (and optionally Settings) from the `/t` shell on a phone

## Testers
1. Play Console → Testing → Internal testing → create release → upload AAB
2. Add tester emails / Google group
3. Copy opt-in link; testers need Play Store access on device

## App Links
After upload keystore exists, put its SHA-256 into `client/public/.well-known/assetlinks.json` and redeploy Vercel.
Verify with Digital Asset Links / `adb shell pm get-app-links uk.co.tradiesmate.app`.
