export type WebsiteClass = "NONE" | "SOCIAL_ONLY" | "DIRECTORY_ONLY" | "PROPER" | "PROPER_DEAD";
export type DomainState = "AVAILABLE" | "TAKEN" | "UNKNOWN";
export type OutreachStatus =
  | "NEW"
  | "SCREENED"
  | "CONTACTED"
  | "INTERESTED"
  | "DEMO_SENT"
  | "SOLD"
  | "DEAD"
  | "DO_NOT_CONTACT";

export interface Lead {
  id: string;
  placeId: string;
  displayName: string;
  occupation: string;
  town: string;
  formattedAddress: string | null;
  phone: string | null;
  phoneIsMobile: boolean;
  email: string | null;
  googleMapsUri: string | null;
  primaryType: string | null;
  editorialSummary: string | null;
  openingHours: string | null;
  googleReviews: { author: string; text: string; rating: number; publishTime?: string }[] | null;
  websiteUri: string | null;
  websiteClass: WebsiteClass;
  websiteCheck: "OK" | "DEAD" | "SKIPPED" | "AMBIGUOUS";
  businessStatus: string;
  rating: number | null;
  userRatingCount: number;
  photoCount: number;
  domainSuggested: string | null;
  domainAvailable: DomainState;
  affiliateUrl: string | null;
  qualified: boolean;
  disqualifiedReason: string | null;
  priorityScore: number;
  outreachStatus: OutreachStatus;
  tpsCheckedAt: string | null;
  notes: string | null;
  siteSlug: string | null;
  siteGeneratedAt: string | null;
  lastFetchedAt: string | null;
  createdAt: string;
}

export interface LeadsResponse {
  data: Lead[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SearchSummary {
  searchRunId: string;
  found: number;
  qualified: number;
  created: number;
  updated: number;
}

export interface JobProgress {
  phase: "fetch" | "process";
  current: number;
  total: number;
  message: string;
  percent: number;
}

export interface LeadFilters {
  websiteClass: WebsiteClass[];
  minReviews?: number;
  minRating?: number;
  minScore?: number;
  occupation?: string;
  town?: string;
  status?: OutreachStatus | "";
  searchRunId?: string;
  qualified: boolean;
  sort: "priorityScore" | "rating" | "userRatingCount" | "createdAt";
  order: "asc" | "desc";
  page: number;
  pageSize: number;
}

export const OUTREACH_STATUSES: OutreachStatus[] = [
  "NEW",
  "SCREENED",
  "CONTACTED",
  "INTERESTED",
  "DEMO_SENT",
  "SOLD",
  "DEAD",
  "DO_NOT_CONTACT",
];

export const WEBSITE_CLASSES: WebsiteClass[] = ["NONE", "SOCIAL_ONLY", "DIRECTORY_ONLY", "PROPER_DEAD", "PROPER"];

export type ClientStatus = "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";
export type Channel = "WHATSAPP" | "SMS" | "BOTH";
export type EnquiryStatus = "ROUTED" | "HELD" | "FAILED";

export interface Enquiry {
  id: string;
  clientId: string;
  name: string;
  phone: string;
  message: string | null;
  postcode: string | null;
  distanceMiles: number | null;
  photoUrls: string[];
  source: string;
  status: EnquiryStatus;
  deliveredAt: string | null;
  deliveryInfo: string | null;
  createdAt: string;
}

export interface Client {
  id: string;
  leadId: string | null;
  businessName: string;
  tradeTitle: string | null;
  town: string | null;
  postcode?: string | null;
  routeKey: string;
  destPhone: string;
  destChannel: Channel;
  status: ClientStatus;
  stripeCustomerId?: string | null;
  stripeSubId?: string | null;
  allowedOrigins: string[];
  tradieNotifyTpl: string | null;
  customerAckTpl: string | null;
  createdAt: string;
  siteSlug?: string | null;
  sitePreviewUrl?: string | null;
  leads30?: number;
  heldTotal?: number;
  enquiries?: Enquiry[];
}

export type ClientAssetKind = "LOGO" | "SHOWCASE" | "JOB" | "OTHER";

export interface ClientAsset {
  id: string;
  clientId: string;
  kind: ClientAssetKind;
  url: string;
  filename: string | null;
  caption: string | null;
  sort: number;
  createdAt: string;
}

export const CLIENT_ASSET_KINDS: ClientAssetKind[] = ["LOGO", "SHOWCASE", "JOB", "OTHER"];

export const CLIENT_STATUSES: ClientStatus[] = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"];
export const CHANNELS: Channel[] = ["SMS", "WHATSAPP", "BOTH"];
