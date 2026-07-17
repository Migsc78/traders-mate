/**
 * TradiesMate seed markers — EVERY seeded row must be identifiable by these.
 * Launch wipe (`npm run db:seed:wipe`) deletes ONLY data matching these rules.
 *
 * Do not reuse these prefixes/phones for real customers.
 */
export const SEED = {
  /** Prefix on Client.businessName and Lead.displayName / notes */
  LABEL: "[SEED]",
  /** Lead.placeId prefix (unique) */
  PLACE_PREFIX: "SEED_TM_",
  /** Client.routeKey prefix (unique) */
  ROUTE_PREFIX: "seed_tm_",
  /** Quote/Invoice.publicToken prefix (unique) */
  TOKEN_PREFIX: "seedtok_",
  /** Client.inboundEmailLocal prefix */
  EMAIL_PREFIX: "seed-",
  /** SearchRun.occupation / town marker */
  SEARCH_MARK: "SEED",
  /** Known demo session raw token (hashed at seed time with MAGIC_LINK_SECRET) */
  SESSION_RAW: "seed_session_demo_plumbing_v1",
} as const;

/** Seed phones — UK test-style numbers; wipe matches these exactly. */
export const SEED_PHONES = {
  /** Primary ACTIVE tradie — magic link / OTP login target */
  demoPlumbing: "07000001001",
  /** TRIAL tradie */
  trialElectric: "07000001002",
  /** PAST_DUE tradie */
  pastDueRoofer: "07000001003",
  /** SUSPENDED */
  suspendedPainter: "07000001004",
  /** Customer / enquiry phones */
  customerAlice: "07000002001",
  customerBob: "07000002002",
  customerCara: "07000002003",
  customerDan: "07000002004",
  customerEve: "07000002005",
  missedCaller: "07000003001",
} as const;

export const SEED_ROUTE_KEYS = {
  demoPlumbing: "seed_tm_demo_plumbing",
  trialElectric: "seed_tm_trial_electric",
  pastDueRoofer: "seed_tm_pastdue_roofer",
  suspendedPainter: "seed_tm_suspended_painter",
} as const;

export function isSeedBusinessName(name: string): boolean {
  return name.startsWith(SEED.LABEL);
}

export function isSeedRouteKey(key: string): boolean {
  return key.startsWith(SEED.ROUTE_PREFIX);
}

export function isSeedPlaceId(placeId: string): boolean {
  return placeId.startsWith(SEED.PLACE_PREFIX);
}

export function isSeedToken(token: string): boolean {
  return token.startsWith(SEED.TOKEN_PREFIX);
}

export function isSeedPhone(phone: string): boolean {
  const normalized = phone.replace(/\s/g, "");
  return Object.values(SEED_PHONES).some((p) => p === normalized);
}
