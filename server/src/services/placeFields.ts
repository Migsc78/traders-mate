import type { PlaceResult } from "./places.js";

export interface StoredGoogleReview {
  author: string;
  text: string;
  rating: number;
  publishTime?: string;
}

export function parseGoogleReviews(place: PlaceResult): StoredGoogleReview[] {
  if (!place.reviews?.length) return [];
  return place.reviews
    .map((r) => ({
      author: r.authorAttribution?.displayName?.trim() || "Google reviewer",
      text: r.text?.text?.trim() || "",
      rating: r.rating ?? 5,
      publishTime: r.publishTime,
    }))
    .filter((r) => r.text.length > 0)
    .slice(0, 5);
}

export function parseOpeningHours(place: PlaceResult): string[] {
  return place.regularOpeningHours?.weekdayDescriptions ?? [];
}

export function parseEditorialSummary(place: PlaceResult): string | null {
  const text = place.editorialSummary?.text?.trim();
  return text || null;
}

export function parsePrimaryType(place: PlaceResult): string | null {
  return place.primaryType?.trim() || place.primaryTypeDisplayName?.text?.trim() || null;
}
