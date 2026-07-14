// Tunable weights for the priority score (0..100). See services/score.ts.

export const SCORING = {
  websiteClassPoints: {
    SOCIAL_ONLY: 30, // engaged owner, easiest yes
    PROPER_DEAD: 30, // thinks they have a site; they don't
    NONE: 25,
    DIRECTORY_ONLY: 20,
    PROPER: 0, // not a lead for this product
  } as Record<string, number>,

  reviewActivityMax: 25, // count component + recency bonus
  reviewCountCap: 30, // reviews beyond this add nothing
  recentReviewBonus: 5, // if a review within recentReviewDays
  recentReviewDays: 90,

  ratingBand: {
    sweetLow: 4.2,
    sweetHigh: 4.9,
    sweetPoints: 20,
    okLow: 3.8,
    okPoints: 12,
    weakLow: 3.5,
    weakPoints: 6,
    // 5.0 with few reviews is treated as "ok", not "sweet"
    fewReviewThreshold: 5,
  },

  tradeValueMax: 15,
  domainAvailableBonus: 5,
  mobilePhoneBonus: 5,
};
