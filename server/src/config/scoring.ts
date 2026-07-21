// Tunable weights for the priority score (0..100). See services/score.ts.

export type SearchMode = "SITE_BUILD" | "SAAS_BETA";

/** Site-build product: reward weak/no website + available .co.uk. */
export const SITE_BUILD_SCORING = {
  websiteClassPoints: {
    SOCIAL_ONLY: 30, // engaged owner, easiest yes
    PROPER_DEAD: 30, // thinks they have a site; they don't
    NONE: 25,
    DIRECTORY_ONLY: 20,
    PROPER: 0, // not a lead for this product
  } as Record<string, number>,

  reviewActivityMax: 25,
  reviewCountCap: 30,
  recentReviewBonus: 5,
  recentReviewDays: 90,

  ratingBand: {
    sweetLow: 4.2,
    sweetHigh: 4.9,
    sweetPoints: 20,
    okLow: 3.8,
    okPoints: 12,
    weakLow: 3.5,
    weakPoints: 6,
    fewReviewThreshold: 5,
  },

  tradeValueMax: 15,
  domainAvailableBonus: 5,
  mobilePhoneBonus: 5,
  hasEmailBonus: 0,
};

/**
 * SaaS beta sourcing: reward live proper sites + review strength.
 * Domain availability is irrelevant.
 */
export const SAAS_BETA_SCORING = {
  websiteClassPoints: {
    PROPER: 25,
    SOCIAL_ONLY: 10, // Facebook-only but busy
    DIRECTORY_ONLY: 0,
    NONE: 0,
    PROPER_DEAD: 0,
  } as Record<string, number>,

  reviewActivityMax: 30,
  reviewCountCap: 40,
  recentReviewBonus: 5,
  recentReviewDays: 90,

  ratingBand: {
    sweetLow: 4.2,
    sweetHigh: 4.9,
    sweetPoints: 20,
    okLow: 3.8,
    okPoints: 12,
    weakLow: 3.5,
    weakPoints: 6,
    fewReviewThreshold: 5,
  },

  tradeValueMax: 15,
  domainAvailableBonus: 0,
  mobilePhoneBonus: 5,
  hasEmailBonus: 5,
};

/** Min Google reviews to qualify as a beta candidate (PROPER). */
export const SAAS_BETA_MIN_REVIEWS_PROPER = 8;
/** SOCIAL_ONLY must be clearly active to count as a beta prospect. */
export const SAAS_BETA_MIN_REVIEWS_SOCIAL = 15;

/** @deprecated use SITE_BUILD_SCORING — kept for older imports/tests */
export const SCORING = SITE_BUILD_SCORING;

export function scoringFor(mode: SearchMode) {
  return mode === "SAAS_BETA" ? SAAS_BETA_SCORING : SITE_BUILD_SCORING;
}
