import assert from "node:assert";
import { createHmac } from "node:crypto";
import { mapEventToStatus, mapSubscriptionStatus, verifyStripeSignature } from "../services/billing/stripe.js";

let passed = 0;
function test(n: string, fn: () => void) { fn(); passed++; console.log("  ✓ " + n); }

console.log("mapEventToStatus");
test("invoice.paid ignored (paid starter must not activate)", () =>
  assert.equal(mapEventToStatus("invoice.paid"), null)
);
test("payment_failed -> PAST_DUE", () => assert.equal(mapEventToStatus("invoice.payment_failed"), "PAST_DUE"));
test("subscription.deleted -> CANCELLED", () => assert.equal(mapEventToStatus("customer.subscription.deleted"), "CANCELLED"));
test("unknown -> null", () => assert.equal(mapEventToStatus("charge.refunded"), null));

console.log("mapSubscriptionStatus");
test("trialing -> TRIAL", () => assert.equal(mapSubscriptionStatus("trialing"), "TRIAL"));
test("active", () => assert.equal(mapSubscriptionStatus("active"), "ACTIVE"));
test("past_due", () => assert.equal(mapSubscriptionStatus("past_due"), "PAST_DUE"));
test("canceled", () => assert.equal(mapSubscriptionStatus("canceled"), "CANCELLED"));

console.log("verifyStripeSignature");
const secret = "whsec_test";
const payload = '{"hello":"world"}';
const t = Math.floor(Date.now() / 1000);
const good = createHmac("sha256", secret).update(t + "." + payload).digest("hex");
test("valid signature passes", () => assert.equal(verifyStripeSignature(payload, `t=${t},v1=${good}`, secret), true));
test("tampered payload fails", () => assert.equal(verifyStripeSignature('{"hello":"evil"}', `t=${t},v1=${good}`, secret), false));
test("stale timestamp fails", () => assert.equal(verifyStripeSignature(payload, `t=${t - 999},v1=${good}`, secret), false));
test("missing secret fails", () => assert.equal(verifyStripeSignature(payload, `t=${t},v1=${good}`, ""), false));

console.log("\nAll " + passed + " assertions passed.");
