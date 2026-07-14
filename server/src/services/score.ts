import { SCORING } from "../config/scoring.js";
import { tradeValue } from "../config/trades.js";
import type { WebsiteClass } from "./classify.js";

export interface ScoreInput {
  websiteClass: WebsiteClass;
  occupation: string;
  rating?: number | null;
  userRatingCount: number;
  lastReviewAt?: Date | null;
  phoneIsMobile: boolean;
  domainAvailable: boolean;
}

function ratingPoints(rating: number | null | undefined, count: number): number {
  const b = SCORING.ratingBand;
  if (rating == null) return 0;
  const perfectButThin = rating >= 5.0 && count < b.fewReviewThreshold;
  if (!perfectButThin && rating >= b.sweetLow && rating <= b.sweetHigh) return b.sweetPoints;
  if (rating >= b.okLow) return b.okPoints;
  if (rating >= b.weakLow) return b.weakPoints;
  return 0;
}

function reviewActivityPoints(count: number, lastReviewAt?: Date | null): number {
  const s = SCORING;
  const countComponent = (Math.min(count, s.reviewCountCap) / s.reviewCountCap) * (s.reviewActivityMax - s.recentReviewBonus);
  let recency = 0;
  if (lastReviewAt) {
    const ageDays = (Date.now() - lastReviewAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= s.recentReviewDays) recency = s.recentReviewBonus;
  }
  return countComponent + recency;
}

/** 0..100 priority score for a QUALIFIED lead. */
export function scoreLead(input: ScoreInput): number {
  const s = SCORING;
  let score = 0;

  score += s.websiteClassPoints[input.websiteClass] ?? 0;
  score += reviewActivityPoints(input.userRatingCount, input.lastReviewAt ?? null);
  score += ratingPoints(input.rating ?? null, input.userRatingCount);
  score += tradeValue(input.occupation) * s.tradeValueMax;
  if (input.domainAvailable) score += s.domainAvailableBonus;
  if (input.phoneIsMobile) score += s.mobilePhoneBonus;

  return Math.max(0, Math.min(100, Math.round(score)));
}
