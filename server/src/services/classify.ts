import { SOCIAL_DOMAINS, DIRECTORY_DOMAINS } from "../config/domains.js";
import { registrableDomain } from "../utils/domain.js";

export type WebsiteClass =
  | "NONE"
  | "SOCIAL_ONLY"
  | "DIRECTORY_ONLY"
  | "PROPER"
  | "PROPER_DEAD";

/**
 * Classify by URL alone. PROPER may later be downgraded to PROPER_DEAD by the
 * reachability check. Pure + synchronous so it is trivially unit-testable.
 */
export function classifyWebsite(websiteUri?: string | null): WebsiteClass {
  if (!websiteUri || !websiteUri.trim()) return "NONE";

  const domain = registrableDomain(websiteUri);
  if (!domain) return "NONE";

  if (SOCIAL_DOMAINS.has(domain)) return "SOCIAL_ONLY";
  if (DIRECTORY_DOMAINS.has(domain)) return "DIRECTORY_ONLY";

  return "PROPER";
}

/** A website class that means "this business needs a real site". */
export function needsWebsite(cls: WebsiteClass): boolean {
  return cls === "NONE" || cls === "SOCIAL_ONLY" || cls === "DIRECTORY_ONLY" || cls === "PROPER_DEAD";
}

/**
 * SaaS beta: prefer live proper sites; allow busy social-only profiles.
 * DIRECTORY / NONE / dead sites are site-build territory, not beta.
 */
export function isSaasBetaWebFit(
  cls: WebsiteClass,
  userRatingCount: number,
  minProperReviews: number,
  minSocialReviews: number
): { ok: boolean; reason: string | null } {
  if (cls === "PROPER") {
    if (userRatingCount < minProperReviews) {
      return { ok: false, reason: "thin_reviews" };
    }
    return { ok: true, reason: null };
  }
  if (cls === "SOCIAL_ONLY") {
    if (userRatingCount < minSocialReviews) {
      return { ok: false, reason: "thin_social" };
    }
    return { ok: true, reason: null };
  }
  return { ok: false, reason: "no_proper_site" };
}

