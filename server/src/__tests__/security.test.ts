/**
 * Security regression checks for Critical/High remediations.
 * Run: npx tsx src/__tests__/security.test.ts
 */
import assert from "node:assert";
import { createHmac } from "node:crypto";
import { secretsEqual } from "../lib/secureCompare.js";
import { assertImageMagic, assertPdfMagic } from "../services/storage/store.js";
import { verifyStripeSignature } from "../services/billing/stripe.js";

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

console.log("\nAll " + passed + " security assertions passed.");
