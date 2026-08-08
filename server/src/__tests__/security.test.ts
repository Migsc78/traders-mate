/**
 * Security regression checks for Critical/High remediations + signed uploads.
 * Run: npx tsx src/__tests__/security.test.ts
 */
import assert from "node:assert";
import { createHmac } from "node:crypto";
import { secretsEqual } from "../lib/secureCompare.js";
import { assertImageMagic, assertPdfMagic } from "../services/storage/store.js";
import { verifyStripeSignature } from "../services/billing/stripe.js";
import {
  isPrivateStorageKey,
  signFileUrl,
  storageKeyFromStored,
  toAccessUrl,
  verifySignedFileRequest,
} from "../services/storage/signedUrls.js";

let passed = 0;
function test(n: string, fn: () => void) {
  fn();
  passed++;
  console.log("  ✓ " + n);
}

console.log("secretsEqual");
test("equal secrets", () => assert.equal(secretsEqual("abc", "abc"), true));
test("unequal secrets", () => assert.equal(secretsEqual("abc", "abd"), false));
test("length mismatch", () => assert.equal(secretsEqual("ab", "abc"), false));

console.log("assertImageMagic");
test("jpeg ok", () => {
  assertImageMagic("image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
});
test("jpeg reject html", () => {
  assert.throws(() => assertImageMagic("image/jpeg", Buffer.from("<html>")), /do not match/);
});
test("png ok", () => {
  assertImageMagic(
    "image/png",
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
  );
});
test("pdf ok", () => assertPdfMagic(Buffer.from("%PDF-1.4 rest")));
test("pdf reject", () => assert.throws(() => assertPdfMagic(Buffer.from("notpdf")), /do not match/));

console.log("verifyStripeSignature still required for empty secret");
test("empty secret fails", () => {
  const payload = "{}";
  const t = Math.floor(Date.now() / 1000);
  const good = createHmac("sha256", "whsec").update(`${t}.${payload}`).digest("hex");
  assert.equal(verifyStripeSignature(payload, `t=${t},v1=${good}`, ""), false);
});

console.log("signed file URLs");
test("private keys detected", () => {
  assert.equal(isPrivateStorageKey("private/certs/a.pdf"), true);
  assert.equal(isPrivateStorageKey("certs/legacy.pdf"), true);
  assert.equal(isPrivateStorageKey("pdfs/q.pdf"), true);
  assert.equal(isPrivateStorageKey("logo.png"), false);
});
test("storageKeyFromStored parses absolute URL", () => {
  assert.equal(
    storageKeyFromStored("https://api.example/uploads/private/certs/a.pdf"),
    "private/certs/a.pdf"
  );
});
test("sign + verify round trip", () => {
  const url = signFileUrl("private/certs/a.pdf", 600);
  const u = new URL(url);
  const key = decodeURIComponent(u.pathname.replace(/^\/api\/files\//, ""));
  assert.equal(
    verifySignedFileRequest(key, u.searchParams.get("exp")!, u.searchParams.get("sig")!),
    true
  );
});
test("expired signature fails", () => {
  assert.equal(
    verifySignedFileRequest("private/certs/a.pdf", String(Math.floor(Date.now() / 1000) - 10), "x"),
    false
  );
});
test("toAccessUrl signs private persisted URLs", () => {
  const access = toAccessUrl("https://api.example/uploads/private/audio/x.webm");
  assert.ok(access && access.includes("/api/files/"));
  assert.ok(access.includes("sig="));
});
test("toAccessUrl leaves public uploads permanent", () => {
  const access = toAccessUrl("https://api.example/uploads/logo.png");
  assert.ok(access && access.includes("/uploads/logo.png"));
  assert.ok(!access.includes("sig="));
});

console.log("\nAll " + passed + " security assertions passed.");
