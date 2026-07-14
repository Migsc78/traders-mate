// Domains that mean "not a real website of their own".
// Matched on the registrable domain (eTLD+1), not substring.

export const SOCIAL_DOMAINS = new Set<string>([
  "facebook.com",
  "m.facebook.com",
  "fb.com",
  "fb.me",
  "instagram.com",
  "linktr.ee",
  "linktree.com",
  "nextdoor.com",
  "nextdoor.co.uk",
  "wa.me",
  "t.me",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "business.site",
  "sites.google.com",
  "google.com", // maps/business links occasionally land here
]);

export const DIRECTORY_DOMAINS = new Set<string>([
  "yell.com",
  "checkatrade.com",
  "ratedpeople.com",
  "bark.com",
  "mybuilder.com",
  "trustatrader.com",
  "houzz.co.uk",
  "houzz.com",
  "thomsonlocal.com",
  "freeindex.co.uk",
  "cylex-uk.co.uk",
  "192.com",
  "trustpilot.com",
]);
