// Lightweight assertions for the pure logic. Run: npm test (uses tsx, no framework).
import assert from "node:assert";
import { classifyWebsite, needsWebsite, isSaasBetaWebFit } from "../services/classify.js";
import { scoreLead } from "../services/score.js";
import { domainCandidates } from "../utils/slug.js";
import { registrableDomain } from "../utils/domain.js";
import { interpretAvailability, ionosApiKeyHeader } from "../services/ionos.js";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("classifyWebsite");
test("empty -> NONE", () => assert.equal(classifyWebsite(""), "NONE"));
test("null -> NONE", () => assert.equal(classifyWebsite(null), "NONE"));
test("facebook -> SOCIAL_ONLY", () => assert.equal(classifyWebsite("https://facebook.com/joesplumbing"), "SOCIAL_ONLY"));
test("www.facebook -> SOCIAL_ONLY", () => assert.equal(classifyWebsite("https://www.facebook.com/x"), "SOCIAL_ONLY"));
test("linktr.ee -> SOCIAL_ONLY", () => assert.equal(classifyWebsite("https://linktr.ee/joe"), "SOCIAL_ONLY"));
test("yell -> DIRECTORY_ONLY", () => assert.equal(classifyWebsite("https://www.yell.com/biz/joe-123"), "DIRECTORY_ONLY"));
test("checkatrade -> DIRECTORY_ONLY", () => assert.equal(classifyWebsite("https://checkatrade.com/joe"), "DIRECTORY_ONLY"));
test("real site -> PROPER", () => assert.equal(classifyWebsite("https://joesplumbing.co.uk"), "PROPER"));

console.log("needsWebsite");
test("NONE needs", () => assert.equal(needsWebsite("NONE"), true));
test("SOCIAL_ONLY needs", () => assert.equal(needsWebsite("SOCIAL_ONLY"), true));
test("PROPER_DEAD needs", () => assert.equal(needsWebsite("PROPER_DEAD"), true));
test("PROPER does not", () => assert.equal(needsWebsite("PROPER"), false));

console.log("isSaasBetaWebFit");
test("PROPER with reviews ok", () => assert.equal(isSaasBetaWebFit("PROPER", 12, 8, 15).ok, true));
test("PROPER thin reviews", () => assert.equal(isSaasBetaWebFit("PROPER", 3, 8, 15).reason, "thin_reviews"));
test("SOCIAL busy ok", () => assert.equal(isSaasBetaWebFit("SOCIAL_ONLY", 20, 8, 15).ok, true));
test("NONE rejected", () => assert.equal(isSaasBetaWebFit("NONE", 50, 8, 15).reason, "no_proper_site"));

console.log("registrableDomain");
test("co.uk keeps 3 labels", () => assert.equal(registrableDomain("https://www.joes-plumbing.co.uk/contact"), "joes-plumbing.co.uk"));
test(".com keeps 2 labels", () => assert.equal(registrableDomain("https://foo.bar.example.com"), "example.com"));

console.log("scoreLead");
test("social-only active mobile beats bare none (site-build)", () => {
  const hot = scoreLead({
    websiteClass: "SOCIAL_ONLY",
    occupation: "electrician",
    rating: 4.8,
    userRatingCount: 40,
    lastReviewAt: new Date(),
    phoneIsMobile: true,
    domainAvailable: true,
    mode: "SITE_BUILD",
  });
  const cold = scoreLead({
    websiteClass: "NONE",
    occupation: "handyman",
    rating: 3.2,
    userRatingCount: 1,
    lastReviewAt: null,
    phoneIsMobile: false,
    domainAvailable: false,
    mode: "SITE_BUILD",
  });
  assert.ok(hot > cold, `expected ${hot} > ${cold}`);
  assert.ok(hot <= 100 && cold >= 0);
});
test("5.0 with 1 review not treated as sweet", () => {
  const thin = scoreLead({
    websiteClass: "NONE",
    occupation: "plumber",
    rating: 5.0,
    userRatingCount: 1,
    lastReviewAt: null,
    phoneIsMobile: false,
    domainAvailable: false,
    mode: "SITE_BUILD",
  });
  const solid = scoreLead({
    websiteClass: "NONE",
    occupation: "plumber",
    rating: 4.6,
    userRatingCount: 20,
    lastReviewAt: null,
    phoneIsMobile: false,
    domainAvailable: false,
    mode: "SITE_BUILD",
  });
  assert.ok(solid > thin, `expected solid ${solid} > thin ${thin}`);
});
test("saas beta prefers PROPER over NONE", () => {
  const proper = scoreLead({
    websiteClass: "PROPER",
    occupation: "plumber",
    rating: 4.6,
    userRatingCount: 25,
    lastReviewAt: new Date(),
    phoneIsMobile: true,
    domainAvailable: false,
    hasEmail: true,
    mode: "SAAS_BETA",
  });
  const none = scoreLead({
    websiteClass: "NONE",
    occupation: "plumber",
    rating: 4.6,
    userRatingCount: 25,
    lastReviewAt: new Date(),
    phoneIsMobile: true,
    domainAvailable: true,
    mode: "SAAS_BETA",
  });
  assert.ok(proper > none, `expected proper ${proper} > none ${none}`);
});

console.log("domainCandidates");
test("builds .co.uk from name + town", () => {
  const c = domainCandidates("Joe's Plumbing Ltd", "Woking");
  assert.ok(c.length >= 1);
  assert.ok(c.every((d) => d.endsWith(".co.uk")));
  assert.ok(c.some((d) => d.includes("joesplumbing")));
});

console.log("ionos.interpretAvailability");
test("{available:true} -> AVAILABLE", () => assert.equal(interpretAvailability({ available: true }), "AVAILABLE"));
test("{available:false} -> TAKEN", () => assert.equal(interpretAvailability({ available: false }), "TAKEN"));
test('{status:"AVAILABLE"} -> AVAILABLE', () => assert.equal(interpretAvailability({ status: "AVAILABLE" }), "AVAILABLE"));
test('{status:"REGISTERED"} -> TAKEN', () => assert.equal(interpretAvailability({ status: "REGISTERED" }), "TAKEN"));
test("nested data[] -> AVAILABLE", () => assert.equal(interpretAvailability({ data: [{ available: true }] }), "AVAILABLE"));
test("garbage -> UNKNOWN", () => assert.equal(interpretAvailability("nope"), "UNKNOWN"));

console.log("ionos.ionosApiKeyHeader");
test("no key -> null", () => assert.equal(ionosApiKeyHeader(), null));

console.log(`\nAll ${passed} assertions passed.`);
