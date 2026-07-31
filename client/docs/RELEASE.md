# Shipping an update

The only page you need. Start to finish: change code in Cursor → push → update Android
→ update iOS.

The native apps ship the website **inside the app** so they open with no signal. That's
the whole point of the offline work — but it means a Vercel deploy no longer updates
the phones by itself. Every release that touches the app has to be built and uploaded
once per store, on top of the normal push.

---

## The whole loop, start to finish

| Step | Where | What you type |
|---|---|---|
| 0. Ship the code change | Windows, in Cursor | `git add`, `git commit`, `git push` — same as any commit |
| 1. Web goes live | — | Vercel deploys automatically from that push, ~1–2 min |
| 2. Android | Windows | `cd client` → `npm run release` → upload the `.aab` to Play → commit + push the version bump |
| 3. iOS | MacBook | `git pull` → `cd client` → `npm run release:ios` → Archive in Xcode |

Everything mechanical — version numbers, building, syncing, finding Java — is done for
you by the two npm scripts. Each one finishes by printing exactly what to click next.
If you forget where you are, just re-read the last thing the terminal told you.

**If the change is web-only** (landing page, admin, anything outside the tradie app
shell), step 0 is the whole job — stop there, nothing else to do.

**If the change touches anything under `client/src` that the tradie app uses**, all
four steps apply, in order. Android before iOS specifically — the Mac reads the version
number Windows sets, it never invents its own, so doing iOS first leaves it with
nothing to read.

---

## 0. One-time setup per machine

Skip this section once it's done — it doesn't need repeating. It exists because a
fresh machine (or the first time you set this up) hits two blockers that have nothing
to do with the release itself: git not knowing who you are, and GitHub not accepting a
plain password over HTTPS.

**Git needs an identity**, or every commit fails with `Author identity unknown`:

```bash
git config user.name "Miguel Coelho"
git config user.email "migsandbron@gmail.com"
```

(Drop `--global` as shown above to scope it to just this repo, or add `--global` once
if every repo on this machine should use the same identity.)

**GitHub needs real authentication for `git push`** — it stopped accepting your account
password over HTTPS years ago. The GitHub CLI sets this up once, properly, so you never
see a username/token prompt again:

```bash
brew install gh      # Mac — if Homebrew itself is missing, see below
gh auth login
```

Answer: **GitHub.com** → **HTTPS** → **Login with a web browser**. It gives you a
one-time code, opens your browser, you approve it, done. `git push` and `git pull` just
work after that.

If `brew` itself isn't installed:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

then follow the two `echo` lines it prints at the end to add Homebrew to your `PATH`,
then run the `gh` install above.

On Windows, the equivalent is `winget install GitHub.cli` then the same `gh auth login`.

---

## 1. Web (unchanged)

```powershell
git push
```

Vercel deploys in a minute or two. Nothing else to do. **The phones do not update from
this** — that's what the rest of this page is for.

If a change is web-only (landing page, admin), stop here.

---

## 2. Android — on Windows

```powershell
cd "C:\Users\miguel\Desktop\Traders Mate\traders-mate-app\client"
npm run release
```

This bumps the version, builds the app, syncs it into both native projects, and
produces the Play upload file. Takes about 5–10 minutes, mostly Gradle.

When it finishes it prints the path to `app-release.aab`. Then:

1. **play.google.com/console** → TradiesMate → Test and release → Testing →
   **Internal testing** → **Create new release**
2. Drag the `.aab` in → Next → **Save and publish**
3. Testers can install within a few minutes

Then commit the version bump — the terminal prints the exact command, but it's:

```powershell
git add client/release.json client/android/app/build.gradle client/ios/App/App.xcodeproj/project.pbxproj
git commit -m "Release 1.0.1 (2)."
git push
```

**Do this before touching the Mac.** The Mac reads the version rather than choosing
its own, so both stores get the same number.

---

## 3. iOS — on the MacBook

```bash
git pull
cd client
npm install
npm run release:ios
```

It refuses to run if you forgot to `git pull`, and tells you so. Otherwise it builds,
syncs, and opens Xcode. Then, in Xcode:

1. Top bar → set destination to **Any iOS Device (arm64)**
   *(Archive is greyed out while a simulator is selected — this catches everyone once)*
2. **Product → Archive** — about 5 minutes
3. Organiser opens → **Distribute App → App Store Connect → Upload**
4. Wait for "Upload Successful"

Then App Store Connect → TestFlight. Processing takes 5–30 min. Internal testers get
it immediately with no review; external testers need Beta App Review the first time
(1–2 days).

### If `git pull` fails with "local changes would be overwritten"

Xcode writes to `project.pbxproj` on its own — opening the project, or re-resolving
signing, can leave uncommitted edits sitting there from a previous session. `git pull`
will refuse rather than risk losing them. Don't discard blindly — check what it is first:

```bash
git diff client/ios/App/App.xcodeproj/project.pbxproj
```

If it's your signing setup (`DEVELOPMENT_TEAM`, `CODE_SIGN_ENTITLEMENTS`), stash it,
pull, then bring it back:

```bash
git stash
git pull
git stash pop
```

If `stash pop` reports a **conflict** in `project.pbxproj`, don't hand-edit the merge
markers — this file is Xcode's generated format and a manual edit can easily leave a
duplicate key that corrupts the project. Instead, take the clean pulled version and
let Xcode regenerate the signing config, which is guaranteed valid:

```bash
git checkout --ours client/ios/App/App.xcodeproj/project.pbxproj
git add client/ios/App/App.xcodeproj/project.pbxproj
git stash drop
```

Then in Xcode: **App** project → **App** target → **Signing & Capabilities** → set
**Team** again. Takes a few seconds, and this should be a one-time thing — once that
commit is pushed once, future pulls on this Mac (or any other) won't hit it again.

---

## Version numbers

`client/release.json` is the single source of truth:

```json
{ "version": "1.0.0", "build": 1 }
```

`npm run release` bumps the patch digit and increments the build, then writes both
into `android/app/build.gradle` and the Xcode project. You never edit these by hand.

```powershell
npm run release              # 1.0.0 → 1.0.1
npm run release -- --minor   # 1.0.1 → 1.1.0
npm run release -- --major   # 1.1.0 → 2.0.0
npm run release -- --no-bump # rebuild the same version (a failed upload, say)
```

Build numbers only ever go up. Both stores reject a reused one, which is why this is
automated rather than remembered.

---

## Testing on a real phone before you release

To point a device at your dev server instead of the bundled app:

```powershell
$env:CAPACITOR_SERVER_URL = "http://10.0.2.2:5173/t"   # Android emulator
npm run cap:sync
npm run cap:android
```

Use your machine's LAN IP instead of `10.0.2.2` for a physical phone.

**Open a fresh terminal afterwards.** `npm run release` deliberately refuses to run
while `CAPACITOR_SERVER_URL` is set, so you can't ship a build pointing at a laptop
that isn't switched on.

---

## Testing that offline actually works

Worth doing on a real device before each store push, because it's the promise you're
selling:

1. Open the app with signal, browse Jobs, a job card, Customers, Rates
2. Put the phone in **aeroplane mode**
3. **Force-quit the app** — swipe it away, don't just background it
4. Reopen it

You should get the app, a banner saying you're offline and when the data was saved,
and all of the above still readable. If you get a blank or error screen, the local
bundle isn't being used — check that `capacitor.config.ts` has no `server` block and
re-run `npm run release`.

---

## When it goes wrong

| What you see | What it means |
|---|---|
| `Author identity unknown` | This machine has no git identity yet — see [One-time setup](#0-one-time-setup-per-machine) above. |
| `Username for 'https://github.com'` prompt | Not authenticated with GitHub over HTTPS. Run `gh auth login` — see [One-time setup](#0-one-time-setup-per-machine). |
| `git pull` refuses: "local changes would be overwritten" | See [If git pull fails](#if-git-pull-fails-with-local-changes-would-be-overwritten) above. |
| `CAPACITOR_SERVER_URL is set` | You're in the terminal you used for device testing. Open a fresh one. |
| `keystore.properties is missing` | See [native-ship-guide.md](./native-ship-guide.md) Part B. One-time setup. |
| `Couldn't find a JDK` | Install Android Studio, or set `JAVA_HOME` to a JDK 17+. |
| `release.json says X but the native project says Y` | You skipped `git pull` on the Mac. |
| Play: "version code already used" | An upload half-succeeded. Re-run `npm run release` for a fresh number. |
| Xcode: Archive greyed out | Destination is a simulator. Set **Any iOS Device (arm64)**. |
| App opens the marketing site | `server.url` crept back into `capacitor.config.ts`. |

---

## Related

[native-ship-guide.md](./native-ship-guide.md) — first-time setup: keystore, Play
Console, Apple accounts · [ios-testflight.md](./ios-testflight.md) ·
[play-internal.md](./play-internal.md) · [capacitor.md](./capacitor.md)
