/**
 * One-command release prep for the TradiesMate native apps.
 *
 * The native apps ship a local bundle so they open with no signal, which means a
 * web deploy no longer updates them — each release has to be built and uploaded.
 * This script does every mechanical part of that so the only thing left is
 * clicking Upload, and prints exactly what to click next.
 *
 *   npm run release            bump, build, sync, and build the Play .aab   (Windows)
 *   npm run release:ios        build, sync, open Xcode — no bump            (Mac)
 *   npm run release -- --minor bump 1.0.3 → 1.1.0 instead of the patch digit
 *
 * The version lives in release.json and is written into both native projects, so
 * Android and iOS can never drift apart or reuse a build number the stores reject.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLIENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_JSON = join(CLIENT_DIR, "release.json");
const BUILD_GRADLE = join(CLIENT_DIR, "android", "app", "build.gradle");
const PBXPROJ = join(CLIENT_DIR, "ios", "App", "App.xcodeproj", "project.pbxproj");

/**
 * Baked in rather than left to a .env file. .env is gitignored, so a fresh clone on
 * the Mac wouldn't have it, and the build would succeed but every API call would
 * throw "VITE_API_BASE is not set" at runtime — a miserable thing to debug on a
 * device. Override with VITE_API_BASE if the API ever moves.
 */
const DEFAULT_API_BASE = "https://traders-mate-production.up.railway.app";

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const target = has("--ios") ? "ios" : "android";

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

let stepNo = 0;
const step = (msg) => console.log(`\n${c.cyan(`[${++stepNo}]`)} ${c.bold(msg)}`);
const note = (msg) => console.log(`    ${c.dim(msg)}`);
const warn = (msg) => console.log(`    ${c.yellow("!")} ${msg}`);

function die(msg, fix) {
  console.error(`\n${c.red("✗ " + msg)}`);
  if (fix) console.error(`\n  ${fix}\n`);
  process.exit(1);
}

function run(cmd, cwd = CLIENT_DIR, env = {}) {
  note(`$ ${cmd}`);
  try {
    execSync(cmd, { cwd, stdio: "inherit", shell: true, env: { ...process.env, ...env } });
  } catch {
    // The command already printed its own errors; a Node stack trace on top of them
    // just buries the useful part.
    die(`\`${cmd}\` failed — see the output above.`);
  }
}

/* ------------------------------------------------------------------ version */

function nextVersion(current) {
  const explicit = args.find((a) => a.startsWith("--version="));
  if (explicit) return explicit.split("=")[1];

  const [major, minor, patch] = current.split(".").map(Number);
  if (has("--major")) return `${major + 1}.0.0`;
  if (has("--minor")) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * Substitutes every `pattern` in a file, failing loudly if one doesn't appear.
 *
 * The check is that the pattern *matched* — not that the file changed. Re-running
 * with --no-bump writes the same numbers back, and that has to stay a valid no-op.
 */
function rewrite(path, label, edits) {
  let text = readFileSync(path, "utf8");
  for (const [pattern, replacement] of edits) {
    // search(), not test() — test() on a /g regex is stateful and would skip matches.
    if (text.search(pattern) === -1) die(`Couldn't find ${pattern} in ${label} — has the file moved on?`);
    text = text.replace(pattern, replacement);
  }
  writeFileSync(path, text);
}

/** Rewrites versionCode/versionName in android/app/build.gradle. */
function writeAndroidVersion(version, build) {
  rewrite(BUILD_GRADLE, "build.gradle", [
    [/versionCode\s+\d+/, `versionCode ${build}`],
    [/versionName\s+"[^"]*"/, `versionName "${version}"`],
  ]);
}

/** Rewrites MARKETING_VERSION/CURRENT_PROJECT_VERSION in the Xcode project (both configs). */
function writeIosVersion(version, build) {
  if (!existsSync(PBXPROJ)) {
    warn("No Xcode project found — skipping iOS version write.");
    return;
  }
  rewrite(PBXPROJ, "project.pbxproj", [
    [/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`],
    [/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`],
  ]);
}

/** Reads back what's actually in build.gradle, to catch a missing `git pull` on the Mac. */
function androidVersionOnDisk() {
  const gradle = readFileSync(BUILD_GRADLE, "utf8");
  return {
    build: Number(gradle.match(/versionCode\s+(\d+)/)?.[1]),
    version: gradle.match(/versionName\s+"([^"]*)"/)?.[1],
  };
}

/* --------------------------------------------------------------------- java */

/** Gradle needs a JDK. Android Studio ships one; find it so nobody sets JAVA_HOME by hand. */
function findJavaHome() {
  if (process.env.JAVA_HOME && existsSync(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  const candidates = [
    join(process.env.ProgramFiles || "C:\\Program Files", "Android", "Android Studio", "jbr"),
    join(process.env.LOCALAPPDATA || "", "Programs", "Android", "Android Studio", "jbr"),
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
  ];
  return candidates.find((p) => p && existsSync(p)) || null;
}

/* --------------------------------------------------------------------- main */

// Strip a UTF-8 BOM before parsing. Notepad and PowerShell's `Set-Content -Encoding
// utf8` both add one, and JSON.parse rejects it with an unreadable error.
const release = (() => {
  try {
    return JSON.parse(readFileSync(RELEASE_JSON, "utf8").replace(/^﻿/, ""));
  } catch (err) {
    die(`release.json isn't valid JSON — ${err.message}`, 'Expected: { "version": "1.0.0", "build": 1 }');
  }
})();
const apiBase = process.env.VITE_API_BASE || DEFAULT_API_BASE;

if (process.env.CAPACITOR_SERVER_URL) {
  die(
    "CAPACITOR_SERVER_URL is set — this would ship a release pointing at a dev server.",
    "Close this terminal and open a fresh one, then run the command again."
  );
}

console.log(c.bold(`\n  TradiesMate release — ${target === "ios" ? "iOS" : "Android"}\n`));

let { version, build } = release;

if (target === "ios") {
  // The version was already bumped and committed on the Windows side. Bumping again
  // here would put a different build number in each store for the same release.
  const onDisk = androidVersionOnDisk();
  if (onDisk.build !== build || onDisk.version !== version) {
    die(
      `release.json says ${version} (${build}) but the native project says ${onDisk.version} (${onDisk.build}).`,
      "Run `git pull` first — the Android side bumps the version, the Mac just follows."
    );
  }
  step(`Using version ${version} (build ${build}) — no bump on the Mac`);
} else {
  if (!has("--no-bump")) {
    version = nextVersion(version);
    build += 1;
  }
  step(`Version ${release.version} (${release.build}) → ${c.green(`${version} (${build})`)}`);
  writeFileSync(RELEASE_JSON, `${JSON.stringify({ version, build }, null, 2)}\n`);
  writeAndroidVersion(version, build);
  writeIosVersion(version, build);
  note("Written to release.json, android/app/build.gradle and ios project.pbxproj");
}

step("Building the web bundle");
note(`API base: ${apiBase}`);
run("npm run build", CLIENT_DIR, { VITE_API_BASE: apiBase });

step("Copying the bundle into the native projects");
run("npx cap sync");

if (target === "ios") {
  step("Opening Xcode");
  run("npx cap open ios");

  console.log(`
${c.green("✓ iOS is ready to archive.")}  Version ${c.bold(`${version} (${build})`)}

  In Xcode — four clicks, in this order:

    1. Top bar: set the destination to ${c.bold("Any iOS Device (arm64)")}
       (Archive is greyed out while a simulator is selected)
    2. Menu: ${c.bold("Product → Archive")}          ~5 min
    3. When the Organiser opens: ${c.bold("Distribute App → App Store Connect → Upload")}
    4. Wait for the "Upload Successful" tick

  Then in App Store Connect → TestFlight:
    · Processing takes 5–30 min, then the build appears
    · Internal testers get it immediately, no review
    · External testers need Beta App Review the first time (1–2 days)

  ${c.dim("Nothing to commit here — the Mac only consumes the version, it never bumps it.")}
`);
  process.exit(0);
}

/* ------------------------------------------------------------------ android */

step("Building the Play upload bundle (.aab)");
const javaHome = findJavaHome();
if (!javaHome) {
  die(
    "Couldn't find a JDK for Gradle.",
    "Install Android Studio, or set JAVA_HOME to a JDK 17+ and run this again."
  );
}
note(`JAVA_HOME: ${javaHome}`);

if (!existsSync(join(CLIENT_DIR, "android", "keystore.properties"))) {
  die(
    "android/keystore.properties is missing — the build would be unsigned and Play would reject it.",
    "Copy keystore.properties.example to keystore.properties and fill in your\n  keystore passwords. See docs/native-ship-guide.md Part B."
  );
}

const isWin = process.platform === "win32";
// Both need the explicit leading path — cmd.exe won't always resolve a bare .bat
// from the working directory, and POSIX shells never search cwd.
const gradlew = isWin ? ".\\gradlew.bat" : "./gradlew";
const javaBin = join(javaHome, "bin");
run(`${gradlew} bundleRelease`, join(CLIENT_DIR, "android"), {
  JAVA_HOME: javaHome,
  // Windows reads Path, POSIX reads PATH — setting the wrong one silently does nothing.
  ...(isWin
    ? { Path: `${javaBin};${process.env.Path || ""}` }
    : { PATH: `${javaBin}:${process.env.PATH || ""}` }),
});

const aab = join(CLIENT_DIR, "android", "app", "build", "outputs", "bundle", "release", "app-release.aab");

console.log(`
${c.green("✓ Android is ready to upload.")}  Version ${c.bold(`${version} (${build})`)}

  Your upload file:
    ${c.cyan(aab)}

  ${c.bold("1. Upload to Play")}  play.google.com/console → TradiesMate
     → Test and release → Testing → Internal testing → ${c.bold("Create new release")}
     → drag the .aab above in → Next → Save and publish
     Live for testers in a few minutes.

  ${c.bold("2. Commit the version bump")} ${c.dim("(so the Mac builds the same number)")}
     git add client/release.json client/android/app/build.gradle \\
             client/ios/App/App.xcodeproj/project.pbxproj
     git commit -m "Release ${version} (${build})."
     git push

  ${c.bold("3. Then on the MacBook")}
     git pull
     cd client && npm install && npm run release:ios

  ${c.dim("Step 2 must happen before step 3, or the Mac will stop and tell you to pull.")}
`);
