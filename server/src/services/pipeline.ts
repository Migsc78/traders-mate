import { prisma } from "../db.js";
import {
  SAAS_BETA_MIN_REVIEWS_PROPER,
  SAAS_BETA_MIN_REVIEWS_SOCIAL,
  type SearchMode,
} from "../config/scoring.js";
import { classifyWebsite, isSaasBetaWebFit, needsWebsite, type WebsiteClass } from "./classify.js";
import { checkReachable } from "./reachability.js";
import { scrapeEmailFromWebsite } from "./emailScrape.js";
import {
  parseEditorialSummary,
  parseGoogleReviews,
  parseOpeningHours,
  parsePrimaryType,
} from "./placeFields.js";
import { checkDomain } from "./domainCheck.js";
import { scoreLead } from "./score.js";
import { reachLimiter } from "../lib/limiter.js";
import type { JobProgress } from "../lib/sse.js";
import type { PlaceResult, SearchParams } from "./places.js";
import { searchPlaces } from "./places.js";

function mapBizStatus(s?: string): "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | "UNKNOWN" {
  switch (s) {
    case "OPERATIONAL":
      return "OPERATIONAL";
    case "CLOSED_TEMPORARILY":
      return "CLOSED_TEMPORARILY";
    case "CLOSED_PERMANENTLY":
      return "CLOSED_PERMANENTLY";
    default:
      return "UNKNOWN";
  }
}

// UK mobile numbers start 07 (or +447)
function isMobile(phone?: string): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\s+/g, "");
  return /^(\+447|07)/.test(digits);
}

function latestReview(place: PlaceResult): Date | null {
  if (!place.reviews?.length) return null;
  const times = place.reviews
    .map((r) => (r.publishTime ? new Date(r.publishTime).getTime() : NaN))
    .filter((t) => !Number.isNaN(t));
  if (!times.length) return null;
  return new Date(Math.max(...times));
}

export interface ProcessedLead {
  placeId: string;
  displayName: string;
  occupation: string;
  town: string;
  formattedAddress: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  phoneIsMobile: boolean;
  googleMapsUri: string | null;
  websiteUri: string | null;
  websiteClass: WebsiteClass;
  websiteCheck: "OK" | "DEAD" | "SKIPPED" | "AMBIGUOUS";
  businessStatus: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | "UNKNOWN";
  rating: number | null;
  userRatingCount: number;
  lastReviewAt: Date | null;
  photoCount: number;
  domainSuggested: string | null;
  domainAvailable: "AVAILABLE" | "TAKEN" | "UNKNOWN";
  affiliateUrl: string | null;
  email: string | null;
  primaryType: string | null;
  editorialSummary: string | null;
  openingHours: string | null;
  googleReviews: { author: string; text: string; rating: number; publishTime?: string }[];
  qualified: boolean;
  disqualifiedReason: string | null;
  priorityScore: number;
}

export type ProcessPlaceOptions = {
  mode?: SearchMode;
};

/**
 * Full enrichment for one raw Place: classify -> reachability -> gate ->
 * domain check (site-build) -> score.
 */
export async function processPlace(
  place: PlaceResult,
  occupation: string,
  town: string,
  opts: ProcessPlaceOptions = {}
): Promise<ProcessedLead> {
  const mode: SearchMode = opts.mode ?? "SITE_BUILD";
  const displayName = place.displayName?.text?.trim() || "(unnamed)";
  const phone = place.nationalPhoneNumber || place.internationalPhoneNumber || null;
  const businessStatus = mapBizStatus(place.businessStatus);
  const websiteUri = place.websiteUri || null;

  let websiteClass = classifyWebsite(websiteUri);
  let websiteCheck: ProcessedLead["websiteCheck"] = "SKIPPED";

  if (websiteClass === "PROPER" && websiteUri) {
    const reach = await reachLimiter.schedule(() => checkReachable(websiteUri));
    websiteCheck = reach.status;
    if (reach.status === "DEAD") websiteClass = "PROPER_DEAD";
  }

  let scrapedEmail: string | null = null;
  if (websiteUri) {
    scrapedEmail = await reachLimiter.schedule(() => scrapeEmailFromWebsite(websiteUri));
  }

  const lastReviewAt = latestReview(place);
  const rating = place.rating ?? null;
  const userRatingCount = place.userRatingCount ?? 0;
  const phoneIsMobile = isMobile(phone ?? undefined);

  // --- Qualification gate (mode-aware) ---
  let qualified = true;
  let disqualifiedReason: string | null = null;

  if (businessStatus !== "OPERATIONAL") {
    qualified = false;
    disqualifiedReason = "closed";
  } else if (!phone) {
    qualified = false;
    disqualifiedReason = "no_phone";
  } else if (mode === "SITE_BUILD") {
    if (!needsWebsite(websiteClass)) {
      qualified = false;
      disqualifiedReason = "has_website";
    }
  } else {
    const fit = isSaasBetaWebFit(
      websiteClass,
      userRatingCount,
      SAAS_BETA_MIN_REVIEWS_PROPER,
      SAAS_BETA_MIN_REVIEWS_SOCIAL
    );
    if (!fit.ok) {
      qualified = false;
      disqualifiedReason = fit.reason;
    }
  }

  // --- Domain check (site-build only — pitch for registering a site) ---
  let domainSuggested: string | null = null;
  let domainAvailable: ProcessedLead["domainAvailable"] = "UNKNOWN";
  let affiliateUrl: string | null = null;
  if (qualified && mode === "SITE_BUILD") {
    const d = await checkDomain(displayName, town);
    domainSuggested = d.suggested;
    domainAvailable = d.state;
    affiliateUrl = d.affiliateLink;
  }

  const priorityScore = qualified
    ? scoreLead({
        websiteClass,
        occupation,
        rating,
        userRatingCount,
        lastReviewAt,
        phoneIsMobile,
        domainAvailable: domainAvailable === "AVAILABLE",
        hasEmail: !!scrapedEmail,
        mode,
      })
    : 0;

  const googleReviews = parseGoogleReviews(place);
  const hours = parseOpeningHours(place);

  return {
    placeId: place.id,
    displayName,
    occupation,
    town,
    formattedAddress: place.formattedAddress || null,
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    phone,
    phoneIsMobile,
    googleMapsUri: place.googleMapsUri || null,
    websiteUri,
    websiteClass,
    websiteCheck,
    businessStatus,
    rating,
    userRatingCount,
    lastReviewAt,
    photoCount: place.photos?.length ?? 0,
    domainSuggested,
    domainAvailable,
    affiliateUrl,
    email: scrapedEmail,
    primaryType: parsePrimaryType(place),
    editorialSummary: parseEditorialSummary(place),
    openingHours: hours.length ? JSON.stringify(hours) : null,
    googleReviews,
    qualified,
    disqualifiedReason,
    priorityScore,
  };
}

export interface SearchSummary {
  searchRunId: string;
  found: number;
  qualified: number;
  created: number;
  updated: number;
  mode: SearchMode;
}

function searchProgress(partial: Omit<JobProgress, "percent"> & { percent?: number }): JobProgress {
  const { phase, current, total, message } = partial;
  if (partial.percent != null) return { phase, current, total, message, percent: partial.percent };
  if (phase === "fetch") return { phase, current, total, message, percent: current >= total ? 15 : 5 };
  const safeTotal = Math.max(total, 1);
  return { phase, current, total, message, percent: Math.min(100, Math.round(15 + (current / safeTotal) * 85)) };
}

/** Orchestrates a full search: Places -> process each -> upsert (dedupe by placeId). */
export async function runSearch(
  params: SearchParams & { mode?: SearchMode },
  onProgress?: (progress: JobProgress) => void
): Promise<SearchSummary> {
  const mode: SearchMode = params.mode ?? "SITE_BUILD";

  onProgress?.(
    searchProgress({
      phase: "fetch",
      current: 0,
      total: 1,
      message:
        mode === "SAAS_BETA"
          ? "Searching Google Places for beta candidates…"
          : "Searching Google Places…",
    })
  );

  const places = await searchPlaces(params);

  onProgress?.(
    searchProgress({
      phase: "fetch",
      current: 1,
      total: 1,
      message: places.length ? `Found ${places.length} businesses` : "No businesses found",
    })
  );

  const run = await prisma.searchRun.create({
    data: {
      occupation: params.occupation,
      town: params.town ?? null,
      centerLat: params.center?.lat ?? null,
      centerLng: params.center?.lng ?? null,
      radiusM: params.radiusM ?? null,
      mode,
    },
  });

  const townLabel = params.town ?? "";
  let qualifiedCount = 0;
  let created = 0;
  let updated = 0;
  const total = places.length;
  let completed = 0;

  await Promise.all(
    places.map(async (place) => {
      const lead = await processPlace(place, params.occupation, townLabel, { mode });
      if (lead.qualified) qualifiedCount += 1;

      const existing = await prisma.lead.findUnique({ where: { placeId: lead.placeId }, select: { id: true } });
      const data = toDbData(lead);

      await prisma.lead.upsert({
        where: { placeId: lead.placeId },
        create: {
          ...data,
          searchRunId: run.id,
        },
        update: {
          ...(({ email: _e, ...rest }) => rest)(data),
          ...(data.email ? { email: data.email } : {}),
          searchRunId: run.id,
          lastFetchedAt: new Date(),
        },
      });

      if (existing) updated += 1;
      else created += 1;

      completed += 1;
      if (total > 0) {
        onProgress?.(
          searchProgress({
            phase: "process",
            current: completed,
            total,
            message: `Enriching ${lead.displayName} (${completed}/${total})…`,
          })
        );
      }
    })
  );

  await prisma.searchRun.update({
    where: { id: run.id },
    data: { resultCount: total, newCount: created },
  });

  onProgress?.(
    searchProgress({ phase: "process", current: total, total: Math.max(total, 1), message: "Done", percent: 100 })
  );

  return { searchRunId: run.id, found: total, qualified: qualifiedCount, created, updated, mode };
}

export function toDbData(lead: ProcessedLead) {
  return {
    placeId: lead.placeId,
    displayName: lead.displayName,
    occupation: lead.occupation,
    town: lead.town,
    formattedAddress: lead.formattedAddress,
    lat: lead.lat,
    lng: lead.lng,
    phone: lead.phone,
    phoneIsMobile: lead.phoneIsMobile,
    googleMapsUri: lead.googleMapsUri,
    websiteUri: lead.websiteUri,
    websiteClass: lead.websiteClass,
    websiteCheck: lead.websiteCheck,
    businessStatus: lead.businessStatus,
    rating: lead.rating,
    userRatingCount: lead.userRatingCount,
    lastReviewAt: lead.lastReviewAt,
    photoCount: lead.photoCount,
    domainSuggested: lead.domainSuggested,
    domainAvailable: lead.domainAvailable,
    affiliateUrl: lead.affiliateUrl,
    email: lead.email,
    primaryType: lead.primaryType,
    editorialSummary: lead.editorialSummary,
    openingHours: lead.openingHours,
    googleReviews: lead.googleReviews.length ? lead.googleReviews : undefined,
    qualified: lead.qualified,
    disqualifiedReason: lead.disqualifiedReason,
    priorityScore: lead.priorityScore,
  };
}
