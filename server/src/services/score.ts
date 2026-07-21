import {
  scoringFor,
  type SearchMode,
} from "../config/scoring.js";
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
  hasEmail?: boolean;
  mode?: SearchMode;
}

function ratingPoints(
  rating: number | null | undefined,
  count: number,
  band: ReturnType<typeof scoringFor>["ratingBand"]
): number {
  if (rating == null) return 0;
  const perfectButThin = rating >= 5.0 && count < band.fewReviewThreshold;
  if (!perfectButThin && rating >= band.sweetLow && rating <= band.sweetHigh) return band.sweetPoints;
  if (rating >= band.okLow) return band.okPoints;
  if (rating >= band.weakLow) return band.weakPoints;
  return 0;
}

function reviewActivityPoints(
  count: number,
  lastReviewAt: Date | null | undefined,
  s: ReturnType<typeof scoringFor>
): number {
  const countComponent =
    (Math.min(count, s.reviewCountCap) / s.reviewCountCap) * (s.reviewActivityMax - s.recentReviewBonus);
  let recency = 0;
  if (lastReviewAt) {
    const ageDays = (Date.now() - lastReviewAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= s.recentReviewDays) recency = s.recentReviewBonus;
  }
  return countComponent + recency;
}

/** 0..100 priority score for a QUALIFIED lead. */
export function scoreLead(input: ScoreInput): number {
  const mode = input.mode ?? "SITE_BUILD";
  const s = scoringFor(mode);
  let score = 0;

  score += s.websiteClassPoints[input.websiteClass] ?? 0;
  score += reviewActivityPoints(input.userRatingCount, input.lastReviewAt ?? null, s);
  score += ratingPoints(input.rating ?? null, input.userRatingCount, s.ratingBand);
  score += tradeValue(input.occupation) * s.tradeValueMax;
  if (input.domainAvailable) score += s.domainAvailableBonus;
  if (input.phoneIsMobile) score += s.mobilePhoneBonus;
  if (input.hasEmail) score += s.hasEmailBonus;

  return Math.max(0, Math.min(100, Math.round(score)));
}
