import { tradeContent, titleCaseTrade, type ServiceItem } from "./content.js";

export interface Review {
  name: string;
  text: string;
  rating: number;
}

export interface Step {
  title: string;
  desc: string;
}

export interface SiteData {
  slug: string;
  businessName: string;
  tradeTitle: string; // "Electrician"
  occupation: string; // raw search term
  town: string;
  phone: string;
  email: string;
  whatsapp: string | null;
  address: string | null;
  mapsUri: string | null;
  rating: number | null;
  reviewCount: number;
  tagline: string;
  heroSub: string;
  services: ServiceItem[];
  steps: Step[];
  about: string;
  areas: string[];
  reviews: Review[];
  domain: string | null;
  primaryColor: string;
  accentColor: string;
  brandIcon: string;
  routeKey: string | null;
  intakeBase: string | null;
  year: number;
  reviewsArePlaceeholder: boolean;
}

// Minimal shape needed from a Lead so this module doesn't depend on Prisma types.
export interface LeadLike {
  displayName: string;
  occupation: string;
  town: string;
  phone: string | null;
  email?: string | null;
  formattedAddress: string | null;
  googleMapsUri: string | null;
  rating: number | null;
  userRatingCount: number;
  domainSuggested: string | null;
  editorialSummary?: string | null;
  googleReviews?: unknown;
}

export interface SiteOverrides {
  email?: string;
  whatsapp?: string;
  tagline?: string;
  heroSub?: string;
  about?: string;
  services?: ServiceItem[];
  areas?: string[];
  reviews?: Review[];
  primaryColor?: string;
  accentColor?: string;
  domain?: string;
  routeKey?: string;
  intakeBase?: string;
}

// Placeholder testimonials — clearly generic, meant to be replaced with the
// business's real Google reviews. Flagged via reviewsArePlaceeholder.
function placeholderReviews(tradeTitle: string): Review[] {
  return [
    { name: "Sarah W.", rating: 5, text: `Fantastic job — turned up on time, tidy and professional. Would recommend to anyone needing a ${tradeTitle.toLowerCase()}.` },
    { name: "James P.", rating: 5, text: "Great communication from quote to finish, and a fair price. Really pleased with the work." },
    { name: "Deborah M.", rating: 5, text: "Friendly, reliable and did exactly what they said they would. Will definitely use again." },
  ];
}

export function slugify(name: string, town: string): string {
  const base = `${name} ${town}`
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "site";
}

export function buildSiteData(lead: LeadLike, overrides: SiteOverrides = {}): SiteData {
  const content = tradeContent(lead.occupation);
  const tradeTitle = titleCaseTrade(lead.occupation);
  const town = lead.town || "your area";
  const storedReviews = (Array.isArray(lead.googleReviews) ? lead.googleReviews : [])
    .map((r) => {
      const row = r as { author?: string; name?: string; text?: string; rating?: number };
      return {
        name: row.author ?? row.name ?? "Google reviewer",
        text: row.text ?? "",
        rating: row.rating ?? 5,
      };
    })
    .filter((r) => r.text.trim());
  const useRealReviews = storedReviews.length > 0;

  return {
    slug: slugify(lead.displayName, town),
    businessName: lead.displayName,
    tradeTitle,
    occupation: lead.occupation,
    town,
    phone: lead.phone ?? "",
    email: overrides.email ?? lead.email ?? "",
    whatsapp: overrides.whatsapp ?? null,
    address: lead.formattedAddress,
    mapsUri: lead.googleMapsUri,
    rating: lead.rating,
    reviewCount: lead.userRatingCount,
    tagline: overrides.tagline ?? content.tagline(town),
    heroSub: overrides.heroSub ?? content.heroSub,
    services: overrides.services ?? content.services,
    steps: content.steps,
    about: overrides.about ?? lead.editorialSummary ?? content.about,
    areas: overrides.areas ?? [town],
    reviews: overrides.reviews ?? (useRealReviews ? storedReviews : placeholderReviews(tradeTitle)),
    domain: overrides.domain ?? lead.domainSuggested,
    primaryColor: overrides.primaryColor ?? content.primary,
    accentColor: overrides.accentColor ?? content.accent,
    brandIcon: content.brandIcon,
    routeKey: overrides.routeKey ?? null,
    intakeBase: overrides.intakeBase ?? null,
    year: new Date().getFullYear(),
    reviewsArePlaceeholder: !overrides.reviews && !useRealReviews,
  };
}
