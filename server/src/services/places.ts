import { env } from "../env.js";
import { getGooglePlacesApiKey } from "../settings.js";
import { placesLimiter, withRetry } from "../lib/limiter.js";

const BASE = "https://places.googleapis.com/v1";

export class PlacesError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "PlacesError";
  }
}

export interface PlaceResult {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  googleMapsUri?: string;
  location?: { latitude: number; longitude: number };
  photos?: unknown[];
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  editorialSummary?: { text?: string };
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  reviews?: {
    publishTime?: string;
    rating?: number;
    text?: { text?: string };
    authorAttribution?: { displayName?: string };
  }[];
}

interface SearchResponse {
  places?: PlaceResult[];
  nextPageToken?: string;
  error?: { status?: string; message?: string };
}

const PLACE_DETAIL_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "rating",
  "userRatingCount",
  "businessStatus",
  "googleMapsUri",
  "location",
  "photos",
  "primaryType",
  "primaryTypeDisplayName",
  "editorialSummary",
  "regularOpeningHours",
  "reviews",
] as const;

function searchFieldMask(): string {
  return PLACE_DETAIL_FIELDS.map((f) => `places.${f}`).join(",") + ",nextPageToken";
}

function placeFieldMask(): string {
  return PLACE_DETAIL_FIELDS.join(",");
}

async function call(endpoint: string, body: Record<string, unknown>, fieldMask: string): Promise<SearchResponse> {
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) {
    throw new PlacesError(502, "places_auth", "GOOGLE_PLACES_API_KEY is not set");
  }

  return placesLimiter.schedule(() =>
    withRetry(
      async () => {
        const res = await fetch(`${BASE}/${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": fieldMask,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45_000),
        });

        const json = (await res.json().catch(() => ({}))) as SearchResponse;

        if (!res.ok) {
          const code = json.error?.status || `HTTP_${res.status}`;
          const message = json.error?.message || `Places request failed (${res.status})`;
          if (res.status === 429 || code === "RESOURCE_EXHAUSTED") {
            throw new PlacesError(429, "rate_limited", message);
          }
          if (res.status === 403 || code === "PERMISSION_DENIED") {
            throw new PlacesError(502, "places_auth", message);
          }
          if (res.status === 400 || code === "INVALID_ARGUMENT") {
            throw new PlacesError(400, "places_bad_request", message);
          }
          throw new PlacesError(502, "places_error", message);
        }
        return json;
      },
      { shouldRetry: (e) => e instanceof PlacesError && e.status === 429 }
    )
  );
}

export interface SearchParams {
  occupation: string;
  town?: string;
  center?: { lat: number; lng: number };
  radiusM?: number;
  maxResults: number;
  /** Fired after each Places page so SSE can stay alive / show progress. */
  onPage?: (info: { page: number; totalSoFar: number; maxResults: number }) => void;
}

/** Text search, optionally biased to a map circle, paginating up to maxResults. */
export async function searchPlaces(params: SearchParams): Promise<PlaceResult[]> {
  const byId = new Map<string, PlaceResult>();
  let pageToken: string | undefined;
  const useMap = !!params.center && !!params.radiusM;
  let page = 0;
  // Google can keep handing nextPageToken after the useful set is exhausted — hard-stop.
  const maxPages = Math.min(8, Math.max(3, Math.ceil(params.maxResults / 10) + 2));

  do {
    const remaining = params.maxResults - byId.size;
    if (remaining <= 0) break;

    const pageSize = Math.max(1, Math.min(20, remaining));
    const body: Record<string, unknown> = {
      textQuery: useMap ? params.occupation : `${params.occupation}${params.town ? ` in ${params.town}` : ""}`,
      pageSize,
      regionCode: "GB",
    };

    if (useMap) {
      body.locationBias = {
        circle: {
          center: { latitude: params.center!.lat, longitude: params.center!.lng },
          radius: params.radiusM,
        },
      };
    }

    if (pageToken) body.pageToken = pageToken;

    page += 1;
    params.onPage?.({ page, totalSoFar: byId.size, maxResults: params.maxResults });

    const before = byId.size;
    const json = await call("places:searchText", body, searchFieldMask());
    for (const place of json.places ?? []) {
      if (place.id && !byId.has(place.id)) byId.set(place.id, place);
    }
    pageToken = json.nextPageToken;
    const added = byId.size - before;

    params.onPage?.({ page, totalSoFar: byId.size, maxResults: params.maxResults });

    // Stop when Google is out of useful results (empty / all duplicates) or page budget hit.
    if (added === 0 || !pageToken || byId.size >= params.maxResults || page >= maxPages) {
      break;
    }

    // pageToken needs a brief moment before it is usable
    await new Promise((r) => setTimeout(r, 1500));
  } while (true);

  return Array.from(byId.values()).slice(0, params.maxResults);
}

/** Re-fetch a single place by ID (for the refresh route). */
export async function getPlace(placeId: string): Promise<PlaceResult | null> {
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) {
    throw new PlacesError(502, "places_auth", "GOOGLE_PLACES_API_KEY is not set");
  }
  return placesLimiter.schedule(async () => {
    const res = await fetch(`${BASE}/places/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": placeFieldMask(),
      },
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await res.json().catch(() => ({}))) as PlaceResult & { error?: { status?: string; message?: string } };
    if (res.status === 404) return null;
    if (!res.ok) {
      const code = json.error?.status || `HTTP_${res.status}`;
      const message = json.error?.message || `Places request failed (${res.status})`;
      if (res.status === 400 || code === "INVALID_ARGUMENT") {
        throw new PlacesError(400, "places_bad_request", message);
      }
      throw new PlacesError(502, "places_error", message);
    }
    return json as PlaceResult;
  });
}
