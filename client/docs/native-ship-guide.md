# TradiesMate native apps — click-by-click ship guide

You are shipping the **Android** app first on Windows. iOS comes later on the MacBook.

**Where you are now:** Android Studio is installed and you see the **Welcome to Android Studio** screen. Start at **Step A** below. Do not click **New Project**.

App ID: `uk.co.tradiesmate.app`  
Project folder: `C:\Users\miguel\Desktop\Traders Mate\traders-mate-app\client\android`

Related short docs: [capacitor.md](./capacitor.md) · [play-internal.md](./play-internal.md) · [ios-testflight.md](./ios-testflight.md)

---

## Big picture (what “done” looks like)

1. Android Studio finishes downloading Android tools (once).
2. You open the existing TradiesMate Android folder (not a new empty app).
3. You create a signing keystore (password you must keep forever).
4. You build an `.aab` file.
5. You upload that file to Google Play **Internal testing**.
6. You install TradiesMate from the Play Store on your phone as a tester.

---

# PART A — Android Studio welcome screen (you are here)

## Step A1 — Do not create a new project

On **Welcome to Android Studio** you will see three big buttons:

| Button | What it does | Do you click it? |
|--------|----------------|------------------|
| **New Project** | Starts a blank Android app | **No** — we already have a project |
| **Open** | Opens a folder on your PC | **Yes — but not yet** (after A2) |
| **Clone Repository** | Downloads from GitHub | **No** — you already have the code |

Leave this window open. First finish one-time SDK setup.

## Step A2 — Make sure the Android SDK is installed

1. On the Welcome screen, look at the bottom for **More Actions** (or a `⋯` / three-dot menu).
2. Click it.
3. Click **SDK Manager**.
4. If a window opens titled **SDK Platforms** / **SDK Tools**:
   - On **SDK Platforms**, tick the newest **Android** API that is already recommended (often Android 15 or 16). At least one platform must be installed.
   - On **SDK Tools**, leave defaults ticked (Android SDK Build-Tools, Platform-Tools, etc.).
   - Click **Apply** → **OK** and wait until downloads finish.
5. Close SDK Manager when done.
6. If you cannot find SDK Manager yet, click **Open** and continue — Studio often prompts to install missing pieces when the project opens.

## Step A3 — Open the TradiesMate Android project

1. Back on Welcome → click **Open**.
2. A file picker opens. Browse to:

   `C:\Users\miguel\Desktop\Traders Mate\traders-mate-app\client\android`

3. Important: select the **`android`** folder itself (the one that contains `app`, `gradle`, `build.gradle`, etc.).
4. Click **OK**.
5. If you see **Trust and Open Project 'android'?** → this is normal for your own project:
   - Leave **Trust all projects in 'client' folder** unticked (optional either way).
   - **Add IDE and 'android' folders to the Microsoft Defender exclusions list** can stay ticked (speeds up builds; Windows may ask for admin).
   - Click the blue **Trust Project** button.
   - Do **not** choose Preview in Safe Mode or Don't Open.
6. Android Studio will now open a big editor window and start **Gradle sync** (progress bar at bottom).

### What you should see while it syncs

- Bottom status may say **Gradle sync in progress…** or download lots of files the first time.
- This can take **5–20 minutes** the first time. Leave it alone. Keep PC awake / online.
- When finished, the bottom should say something like **Gradle sync finished** with no red error banner.

### If it asks about JDK / SDK

- Prefer the bundled JDK (**jbr** / JetBrains Runtime).
- If a banner says **SDK not found** → click the link / **Install** and accept licenses.
- If a license dialog appears → accept all → Continue.

### If Gradle sync fails with a red error

Copy the first red error line. Common fixes:

1. **File → Invalidate Caches → Invalidate and Restart**
2. Or close Studio, open PowerShell later and run from `client\android`: `.\gradlew.bat --stop` then reopen the project.
3. Make sure you opened `...\client\android`, not `traders-mate-app` root and not `client` alone.

**Checkpoint:** Project is open, Gradle sync finished, no red error bar. Left sidebar should list modules like `app`, `capacitor-android`, `capacitor-app`, `capacitor-splash-screen`, `capacitor-status-bar`. You can continue to Part B even if the code looks unfamiliar — you do not need to edit Java for the first release.

### Ignore these upgrade popups (for now)

Android Studio may show banners like:

- **Project update recommended** / **Start AGP Upgrade Assistant**
- **Migrate to Gradle Daemon toolchain** / **Migrate**
- Agent Mode tips

Click the **X** to dismiss them. **Do not** run Upgrade Assistant or Migrate while shipping the first build — those can break Capacitor’s Gradle setup. You can revisit upgrades later.

---

# PART B — Create the signing keystore (PowerShell)

You do this **once**. Back up the file + passwords like a bank password.

## Step B1 — Open PowerShell

1. Press Windows key, type `PowerShell`, open **Windows PowerShell**.
2. Paste this and press Enter:

```powershell
cd "C:\Users\miguel\Desktop\Traders Mate\traders-mate-app\client\android"
```

3. Check you are in the right place:

```powershell
dir
```

You should see folders/files like `app`, `gradle`, `gradlew.bat`, `build.gradle`.

## Step B2 — Find keytool

Try this first:

```powershell
& "$env:ProgramFiles\Android\Android Studio\jbr\bin\keytool.exe" -help
```

If that prints help text, you are good.  
If it says it cannot find the path, try:

```powershell
Get-ChildItem "$env:LOCALAPPDATA\Programs\Android\Android Studio\jbr\bin\keytool.exe" -ErrorAction SilentlyContinue
Get-ChildItem "$env:ProgramFiles\Android\Android Studio\jbr\bin\keytool.exe" -ErrorAction SilentlyContinue
```

Use whichever full path exists in the next commands.

## Step B3 — Generate `upload-keystore.jks`

Still in the `android` folder, run:

```powershell
& "$env:ProgramFiles\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v `
  -storetype PKCS12 `
  -keystore upload-keystore.jks `
  -alias upload `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000
```

### Answer the questions like this

| Prompt | What to type |
|--------|----------------|
| Enter keystore password | Make a strong password. Type it carefully. **Write it down.** |
| Re-enter new password | Same password again |
| What is your first and last name? | Your name or `TradiesMate` |
| Organizational unit | `TradiesMate` |
| Organization | Your company name or `TradiesMate` |
| City | Your city |
| State | e.g. `England` |
| Country code | `GB` |
| Is CN=… correct? | `yes` |
| Enter key password for \<upload\> | Press **Enter** to use the **same** password as the keystore (simplest) |

When finished you should see a new file:

`C:\Users\miguel\Desktop\Traders Mate\traders-mate-app\client\android\upload-keystore.jks`

**Backup now:** copy that `.jks` file to OneDrive/USB/password manager vault, and save both passwords somewhere safe.

## Step B4 — Create `keystore.properties`

In the same PowerShell window:

```powershell
Copy-Item keystore.properties.example keystore.properties
notepad keystore.properties
```

Notepad opens. Change it to look exactly like this (with your real passwords):

```properties
storeFile=upload-keystore.jks
storePassword=PASTE_YOUR_STORE_PASSWORD_HERE
keyAlias=upload
keyPassword=PASTE_YOUR_KEY_PASSWORD_HERE
```

Save (`Ctrl+S`) and close Notepad.

**Do not** put this file on GitHub. It is gitignored on purpose.

---

# PART C — Put the SHA-256 into App Links (so SMS links can open the app)

## Step C1 — Print the fingerprint

```powershell
cd "C:\Users\miguel\Desktop\Traders Mate\traders-mate-app\client\android"

& "$env:ProgramFiles\Android\Android Studio\jbr\bin\keytool.exe" -list -v `
  -keystore upload-keystore.jks `
  -alias upload
```

Enter the keystore password when asked.

In the output, find a line like:

`SHA256: AB:CD:EF:12:...`

Copy the whole fingerprint after `SHA256:` (including colons is fine).

## Step C2 — Edit `assetlinks.json`

1. In Cursor / VS Code / Notepad, open:

   `C:\Users\miguel\Desktop\Traders Mate\traders-mate-app\client\public\.well-known\assetlinks.json`

2. Replace `REPLACE_WITH_UPLOAD_KEYSTORE_SHA256` with your fingerprint.
3. Save.

Example shape (yours will have a real fingerprint):

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "uk.co.tradiesmate.app",
      "sha256_cert_fingerprints": [
        "AB:CD:EF:..."
      ]
    }
  }
]
```

## Step C3 — Commit and push so Vercel deploys it

In Cursor chat you can ask to commit/push, or in PowerShell from the repo root:

```powershell
cd "C:\Users\miguel\Desktop\Traders Mate\traders-mate-app"
git add client/public/.well-known/assetlinks.json
git commit -m "Add Play upload keystore SHA-256 for App Links."
git push
```

Wait for Vercel to finish deploying. Then open in Chrome:

`https://tradiesmate.co.uk/.well-known/assetlinks.json`

You should see your real fingerprint, not `REPLACE_WITH_...`.

---

# PART D — Sync Capacitor, then build the AAB

## Step D1 — Sync web → native (PowerShell)

```powershell
cd "C:\Users\miguel\Desktop\Traders Mate\traders-mate-app\client"
npm run cap:sync
```

Wait until it finishes with no errors. This builds the website and copies config into Android/iOS.

## Step D2 — Build the Play upload file (AAB)

You must be **inside** the `android` folder (not `client`). Also set Java for this PowerShell window (Android Studio’s JDK):

```powershell
cd "C:\Users\miguel\Desktop\Traders Mate\traders-mate-app\client\android"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
.\gradlew.bat bundleRelease
```

If you see `JAVA_HOME is not set`, you skipped the two `$env:` lines — paste all four lines together.

First run can take a long time. Success looks like:

`BUILD SUCCESSFUL`

Your upload file is here:

`C:\Users\miguel\Desktop\Traders Mate\traders-mate-app\client\android\app\build\outputs\bundle\release\app-release.aab`

If it fails because of signing:
- Re-check `keystore.properties` passwords
- Confirm `upload-keystore.jks` is in `client\android\` (same folder as `keystore.properties`, not inside `app\`)
- Confirm `storeFile=upload-keystore.jks` (path is relative to the `android` folder)

## Step D3 (optional but recommended) — Run the app once on a phone/emulator

### Option 1 — From Android Studio (easiest)

1. If Studio is still open on the `android` project, good. If not: Welcome → **Open** → same `...\client\android` folder.
2. Wait for Gradle sync to finish again if needed.
3. At the top toolbar, find the green **Run** ▶ button.
4. Next to it is a device dropdown:
   - If you have an Android phone: enable **Developer options** + **USB debugging**, plug USB in, accept the prompt on the phone. The phone name should appear in the dropdown.
   - Or create an emulator: device dropdown → **Device Manager** / **Create Virtual Device** → pick a Pixel phone → download a system image if asked → Finish → select that device.
5. Click green **Run** ▶.
6. App should open. You should see **Tradie Auth / Jobs** (`/t`), **not** the marketing homepage.

### Option 2 — From PowerShell

```powershell
cd "C:\Users\miguel\Desktop\Traders Mate\traders-mate-app\client"
npm run cap:android
```

That opens Android Studio on the project; then use Run ▶ as above.

---

# PART E — Google Play Console (browser)

Do this in Chrome on Windows. You need a Google account and the **£25** Play developer registration if not already paid.

## Step E1 — Open Play Console and create the app

1. Go to [https://play.google.com/console](https://play.google.com/console)
2. Sign in.
3. Click **Create app** (or **All apps** → Create app).
4. Fill in:
   - App name: `TradiesMate`
   - Default language: English (United Kingdom) if available, else English
   - App or game: **App**
   - Free or paid: **Free**
5. Tick the declarations / accept.
6. Click **Create app**.

You land on the app **Dashboard**. There will be a checklist of unfinished tasks. Work through them until Internal testing is allowed.

## Step E2 — Privacy policy

1. Left menu → **Policy** / **App content** (wording varies) → find **Privacy policy**.
2. For now enter: `https://tradiesmate.co.uk/`
3. Save. (Later you should add a real `/privacy` page.)

## Step E3 — App access

1. Find **App access**.
2. Choose that the app is restricted / needs login (not fully open without account).
3. Add instructions like:

   > Sign in with a UK mobile number on the Auth screen. Enter the one-time code from SMS, or use the magic link SMS.

4. If they ask for a test login and you do not have a shared demo account yet, say login is OTP-only via SMS to a registered tradie number, and provide a tester phone you control.

## Step E4 — Ads / audience / news / COVID

Typical answers for TradiesMate:

- **Ads:** No, app does not contain ads  
- **Target audience:** 18+ / not primarily children  
- **News app:** No  
- **COVID contact tracing / etc.:** No  

Complete each form and save.

## Step E5 — Content rating

1. Open **Content rating**.
2. Start questionnaire.
3. Category: business / productivity style answers (no social network, no user-generated public feed, no gambling, etc.).
4. Submit and apply the rating when offered.

## Step E6 — Data safety

Be honest. Rough guidance:

- Collects / processes: phone number, business name, customer job details, payment-related billing via Stripe (if applicable).
- Data is used to provide the app features (quoting, jobs, invoices).
- Data is not sold.
- Encryption in transit: Yes (HTTPS).
- Users can request deletion via support if that matches your practice.

Save when complete.

## Step E7 — Main store listing

Left menu → **Grow** / **Store presence** → **Main store listing** (names vary).

Fill:

| Field | Value |
|-------|--------|
| App name | TradiesMate |
| Short description | Turn missed calls into quoted jobs for UK trades. |
| Full description | Dedicated UK number, SMS missed-call rescue, van-friendly quotes, Pay Now deposits, diary and certificates. Built for plumbers, electricians and UK trades. |
| App icon | Upload 512×512 from `client\public\icons\` (e.g. `icon-512.png` if present) |
| Feature graphic | 1024×500 image (can make a simple orange/navy banner with “TradiesMate”) |
| Phone screenshots | At least 2 — take screenshots of Jobs, Quotes, Customers on your phone from `https://tradiesmate.co.uk/t` |

Category: **Business**  
Contact email: your support email  
Save.

## Step E8 — Internal testing release (upload the AAB)

1. Left menu → **Testing** → **Internal testing**.
2. Click **Create new release** (or **Create release**).
3. Under App bundles, click **Upload** and choose:

   `C:\Users\miguel\Desktop\Traders Mate\traders-mate-app\client\android\app\build\outputs\bundle\release\app-release.aab`

4. Wait for upload + processing.
5. Release name: e.g. `1.0 (1)`
6. Release notes: `First internal build of TradiesMate tradie app.`
7. **Next** / **Save** → **Review release** → **Start rollout to Internal testing**.

## Step E9 — Add yourself as a tester

1. Still under **Internal testing**, open the **Testers** tab.
2. Create an email list (e.g. `TradiesMate internal`).
3. Add your Gmail address (must be the Google account on the Android phone).
4. Save.
5. Copy the **opt-in / join** link shown on that page.
6. On your Android phone, open that link in Chrome while signed into the same Google account.
7. Accept becoming a tester.
8. Tap the link to view the app in Play Store → **Install**.

First availability can take **5–60 minutes**. If Install is missing, wait and refresh.

---

# PART F — Check the app on your phone

1. Open **TradiesMate** from the app drawer.
2. You should land on tradie **Auth** or **Jobs** — never the public marketing homepage.
3. Sign in with OTP (phone + code).
4. Browse Jobs / Quotes / Customers.

Magic-link SMS opening the app (instead of Chrome) only works after App Links verify. OTP always works as backup.

### Optional USB App Links check

On PC with phone USB-debugging connected:

```powershell
adb shell pm get-app-links uk.co.tradiesmate.app
```

Look for `tradiesmate.co.uk` verified. If not:

```powershell
adb shell pm verify-app-links --re-verify uk.co.tradiesmate.app
```

If still failing after a day: Play Console → your app → **Setup** → **App signing** → copy the **App signing key certificate** SHA-256 → add it as a second fingerprint in `assetlinks.json` → push → redeploy.

---

# PART G — Later: MacBook M4 + TestFlight (skip until Android works)

## G1 — Apple accounts (can do in browser on Windows)

1. Enrol [Apple Developer Program](https://developer.apple.com/programs/) if needed (~£79/year).
2. [developer.apple.com](https://developer.apple.com) → Account → **Identifiers** → **+** → App IDs  
   - Description: TradiesMate  
   - Bundle ID: `uk.co.tradiesmate.app` (Explicit)  
   - Capabilities: tick **Associated Domains** → Continue → Register  
3. [App Store Connect](https://appstoreconnect.apple.com) → **Apps** → **+** → New App  
   - Same bundle ID, name TradiesMate, UK/English  
4. Note **Team ID** from Membership (10 characters).

## G2 — Update Universal Links file

Edit `client/public/.well-known/apple-app-site-association`  
Replace `TEAMID` with your Team ID so it looks like `ABCD123456.uk.co.tradiesmate.app`.  
Commit, push, wait for Vercel. Confirm the URL shows your Team ID.

## G3 — On the MacBook

1. Install **Xcode** from the Mac App Store (large; let it finish).
2. Open Terminal:

```bash
cd ~/Desktop/traders-mate-app/client   # or wherever you cloned/pulled the repo
npm install
npm run cap:sync
npm run cap:ios
```

3. Xcode opens.
4. Left sidebar → click the blue **App** project → select **App** target.
5. Tab **Signing & Capabilities**:
   - Team: your personal/company team  
   - Bundle Identifier: `uk.co.tradiesmate.app`  
   - Associated Domains should list `applinks:tradiesmate.co.uk`
6. Plug in iPhone, trust computer, select your iPhone as run destination, press Run once to verify.
7. Menu **Product → Archive**. When archive finishes → **Distribute App** → **App Store Connect** → Upload.
8. In App Store Connect → **TestFlight** → wait for processing → add internal testers → install **TestFlight** app on iPhone → install TradiesMate.

---

# If you get stuck

| What you see | What to do |
|--------------|------------|
| Welcome screen — unsure which button | **Open**, never **New Project** |
| Opened wrong folder | Close project → Welcome → Open → `...\client\android` |
| Gradle sync forever / red error | Wait 20 min first; then File → Invalidate Caches; check internet |
| `keytool` path not found | Open Android Studio once more; use path under `Android Studio\jbr\bin\keytool.exe` |
| `bundleRelease` unsigned / fails | Check `keystore.properties` next to `upload-keystore.jks` in `android\` |
| App opens marketing site | Production deploy missing Capacitor bootstrap; confirm `https://tradiesmate.co.uk/t` in browser first |
| Play won’t let you create release | Finish Dashboard checklist (privacy, rating, data safety, listing) |
| Tester can’t see Install | Wrong Google account on phone, or wait up to an hour after rollout |
| SMS link opens Chrome not app | assetlinks fingerprint / Play app-signing SHA; OTP still works |

---

# Where am I right now? (quick jump)

| Screen / situation | Jump to |
|--------------------|---------|
| Welcome to Android Studio | **Step A1 → A3** |
| Project open, Gradle finished | **Part B** (keystore) |
| Keystore done | **Part C** then **Part D** |
| Have `app-release.aab` | **Part E** |
| App installed from Play | **Part F** |
| Ready for iPhone | **Part G** |
