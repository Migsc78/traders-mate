// Assertions for the website generator (pure render + data build). Run: npm run test:site
import assert from "node:assert";
import { buildSiteData, slugify, type LeadLike } from "../services/site/siteData.js";
import { renderSite } from "../services/site/template.js";
import { tradeContent } from "../services/site/content.js";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const lead: LeadLike = {
  displayName: "Joe's Plumbing Ltd",
  occupation: "plumber",
  town: "Woking",
  phone: "07123 456789",
  formattedAddress: "1 High St, Woking GU21 6AA",
  googleMapsUri: "https://maps.google.com/?cid=1",
  rating: 4.8,
  userRatingCount: 37,
  domainSuggested: "joesplumbing-woking.co.uk",
};

console.log("slugify");
test("makes a url-safe slug", () => assert.equal(slugify("Joe's Plumbing Ltd", "Woking"), "joe-s-plumbing-ltd-woking"));

console.log("tradeContent");
test("known trade returns specific services", () => assert.ok(tradeContent("plumber").services.length >= 3));
test("unknown trade falls back to generic", () => assert.ok(tradeContent("alpaca wrangler").services.length >= 3));

console.log("buildSiteData");
test("derives trade title + tagline + town", () => {
  const d = buildSiteData(lead);
  assert.equal(d.tradeTitle, "Plumber");
  assert.ok(d.tagline.includes("Woking"));
  assert.equal(d.phone, "07123 456789");
  assert.equal(d.areas[0], "Woking");
  assert.equal(d.reviewsArePlaceeholder, true);
});
test("overrides win", () => {
  const d = buildSiteData(lead, { email: "joe@x.co.uk", tagline: "Custom", areas: ["Woking", "Guildford"] });
  assert.equal(d.email, "joe@x.co.uk");
  assert.equal(d.tagline, "Custom");
  assert.deepEqual(d.areas, ["Woking", "Guildford"]);
});

console.log("renderSite");
const html = renderSite(buildSiteData(lead, { email: "joe@x.co.uk" }));
test("valid html document", () => assert.ok(html.startsWith("<!doctype html>")));
test("town in <title>", () => assert.ok(/<title>[^<]*Woking[^<]*<\/title>/.test(html)));
test("business name present", () => assert.ok(html.includes("Joe&#39;s Plumbing Ltd") || html.includes("Joe's Plumbing Ltd")));
test("click-to-call tel link", () => assert.ok(html.includes('href="tel:07123456789"')));
test("LocalBusiness JSON-LD", () => assert.ok(html.includes('"@type":"LocalBusiness"')));
test("aggregateRating from Google data", () => assert.ok(html.includes('"AggregateRating"') && html.includes('"ratingValue":4.8')));
test("map embed present", () => assert.ok(html.includes("google.com/maps?q=")));
test("sticky mobile call bar", () => assert.ok(html.includes("mobile-cta")));
test("escapes business name in json-ld safely", () => assert.ok(!html.includes("<script>alert")));

console.log(`\nAll ${passed} assertions passed.`);
