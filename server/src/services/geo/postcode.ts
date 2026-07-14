// UK postcode geocoding + distance helper, backed by the free postcodes.io API (no key required).
import { withRetry } from "../../lib/limiter.js";

interface GeoPoint {
  lat: number;
  lng: number;
}

const UK_POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

// Best-effort in-memory cache so repeated lookups for the same postcode (e.g. a busy
// tradie's own business postcode) don't hit the API every time. Not persisted.
const cache = new Map<string, GeoPoint | null>();

export function normalizePostcode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toUpperCase().replace(/\s+/g, " ");
  const m = trimmed.match(UK_POSTCODE_RE);
  if (!m) return null;
  return `${m[1]}${m[2] ? " " + m[2] : ""}`.trim();
}

/** Pulls a UK postcode out of a free-text address string, e.g. Google's formattedAddress. */
export function extractPostcode(address: string | null | undefined): string | null {
  return normalizePostcode(address);
}

async function fetchGeo(postcode: string): Promise<GeoPoint | null> {
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`postcodes.io ${res.status}`);
  const body = (await res.json()) as { result?: { latitude: number; longitude: number } };
  if (!body.result) return null;
  return { lat: body.result.latitude, lng: body.result.longitude };
}

export async function geocodePostcode(raw: string | null | undefined): Promise<GeoPoint | null> {
  const postcode = normalizePostcode(raw);
  if (!postcode) return null;
  if (cache.has(postcode)) return cache.get(postcode) ?? null;
  try {
    const point = await withRetry(() => fetchGeo(postcode), { retries: 2, baseMs: 300 });
    cache.set(postcode, point);
    return point;
  } catch (err) {
    console.warn("[geo] postcode lookup failed", postcode, err instanceof Error ? err.message : err);
    return null;
  }
}

function haversineMiles(a: GeoPoint, b: GeoPoint): number {
  const R = 3958.8; // Earth radius in miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Distance in miles (1dp) between two UK postcodes, or null if either can't be geocoded. */
export async function distanceMilesBetween(
  fromPostcode: string | null | undefined,
  toPostcode: string | null | undefined
): Promise<number | null> {
  const [a, b] = await Promise.all([geocodePostcode(fromPostcode), geocodePostcode(toPostcode)]);
  if (!a || !b) return null;
  return Math.round(haversineMiles(a, b) * 10) / 10;
}
