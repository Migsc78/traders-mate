// Pure-logic tests for lead routing + messaging. Run via tsc-emit + node.
import assert from "node:assert";
import { routeDecision, renderTemplate, buildTradieMessage, buildCustomerAck, DEFAULT_TRADIE_NOTIFY } from "../services/messaging/render.js";
import { toE164UK } from "../services/messaging/sender.js";
import { generateRouteKey, isRouteKey } from "../routing/routeKey.js";

let passed = 0;
function test(name: string, fn: () => void) { fn(); passed++; console.log("  ✓ " + name); }

console.log("routeDecision (payment gate)");
test("ACTIVE routes", () => assert.equal(routeDecision("ACTIVE"), "ROUTED"));
test("PAST_DUE holds", () => assert.equal(routeDecision("PAST_DUE"), "HELD"));
test("SUSPENDED holds", () => assert.equal(routeDecision("SUSPENDED"), "HELD"));
test("CANCELLED holds", () => assert.equal(routeDecision("CANCELLED"), "HELD"));

console.log("toE164UK");
test("0-prefixed mobile", () => assert.equal(toE164UK("07545 703118"), "+447545703118"));
test("already E.164 unchanged", () => assert.equal(toE164UK("+447545703118"), "+447545703118"));
test("44-prefixed gets +", () => assert.equal(toE164UK("447545703118"), "+447545703118"));

console.log("routeKey");
test("generates tm_ + 8 hex", () => assert.ok(isRouteKey(generateRouteKey())));
test("rejects junk", () => assert.equal(isRouteKey("nope"), false));

console.log("templates");
const vars = { name: "Jane", phone: "07700 900123", message: "Leaking tap", business: "Joe Plumbing", town: "Woking" };
test("renders placeholders", () => {
  const out = renderTemplate("{{name}} {{phone}} — {{message}} @ {{business}} ({{town}})", vars);
  assert.equal(out, "Jane 07700 900123 — Leaking tap @ Joe Plumbing (Woking)");
});
test("empty message -> friendly default", () => {
  assert.ok(renderTemplate("{{message}}", { ...vars, message: "" }).includes("no details"));
});
test("tradie message appends photos", () => {
  const out = buildTradieMessage(null, { ...vars, photos: ["https://x/1.jpg"] });
  assert.ok(out.includes("Jane") && out.includes("Photos:") && out.includes("1.jpg"));
});
test("default tradie template used when none set", () => {
  assert.ok(buildTradieMessage(undefined, vars).includes("Jane"));
  assert.ok(DEFAULT_TRADIE_NOTIFY.includes("{{name}}"));
});
test("customer ack names the business", () => {
  assert.ok(buildCustomerAck(null, vars).includes("Joe Plumbing"));
});

console.log("\nAll " + passed + " assertions passed.");
