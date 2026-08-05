import { apiUrl } from "./base";
import { clearOfflineCache } from "../lib/offlineCache";
import { clearOutbox, enqueue, newOutboxId } from "../lib/outbox";
import { isOfflineNow, markServerReachable } from "../lib/connectivity";

const SESSION_KEY = "tm_tradie_session";

export class TradieApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "TradieApiError";
    this.status = status;
  }

  /** status 0 — the request never reached the server (no signal, DNS, timeout). */
  get isOffline(): boolean {
    return this.status === 0;
  }
}

export function getTradieSession(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function setTradieSession(token: string | null) {
  if (token) {
    localStorage.setItem(SESSION_KEY, token);
  } else {
    localStorage.removeItem(SESSION_KEY);
    // The offline cache holds customer names, numbers and addresses — it goes with
    // the session, not least on a shared or handed-down phone. The outbox goes too:
    // queued writes belong to the account that made them.
    void clearOfflineCache();
    void clearOutbox();
  }
}

export async function tRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getTradieSession();
  let res: Response;
  try {
    res = await fetch(apiUrl(`/api/t${path}`), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch {
    // The only honest signal that there's no usable connection — navigator.onLine
    // lies inside WKWebView. Drives the offline strip and the disabled actions.
    markServerReachable(false);
    // "TypeError: Failed to fetch" means nothing to a tradie in a basement.
    throw new TradieApiError(0, "No signal — this needs a connection. Try again when you're back in range.");
  }
  markServerReachable(true);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body?.error?.message || message;
    } catch {
      /* ignore */
    }
    throw new TradieApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

/** Either the server answered, or the write is safely queued for when it can. */
export type QueuedOr<T> = { queued: true } | { queued: false; result: T };

/**
 * Send a write now if possible, otherwise put it in the outbox.
 *
 * The immediate attempt carries the *same* Idempotency-Key the queued retry will
 * use. That matters: a request can reach the server and have its response die on
 * a one-bar connection, which is indistinguishable from never arriving. Sharing
 * the key means the retry is recognised and the original response replayed,
 * instead of a second draft quote appearing.
 *
 * Only for routes the server marks idempotent — see middleware/idempotency.ts.
 */
export async function sendOrQueue<T>(opts: {
  label: string;
  path: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  body: unknown;
  invalidates: string[];
}): Promise<QueuedOr<T>> {
  const id = newOutboxId();
  const queueIt = async (): Promise<QueuedOr<T>> => {
    await enqueue({
      id,
      label: opts.label,
      path: opts.path,
      method: opts.method,
      body: opts.body,
      invalidates: opts.invalidates,
    });
    return { queued: true };
  };

  // Known offline — don't make the tradie wait on a fetch that can't succeed.
  if (isOfflineNow()) return queueIt();

  try {
    const result = await tRequest<T>(opts.path, {
      method: opts.method,
      body: JSON.stringify(opts.body),
      headers: { "Idempotency-Key": id },
    });
    return { queued: false, result };
  } catch (err) {
    // Only queue when the network was the problem. A 4xx is a real rejection and
    // must surface now, while the tradie still has the screen in front of them.
    if (err instanceof TradieApiError && err.isOffline) return queueIt();
    throw err;
  }
}

async function signupRequest<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(`/api/signup${path}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      message = j?.error?.message || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

type MagicConsumeResult = {
  sessionToken: string;
  clientId: string;
  caps: { claude: boolean; whisper: boolean };
};

const magicConsumeInflight = new Map<string, Promise<MagicConsumeResult>>();

export function consumeMagicOnce(token: string): Promise<MagicConsumeResult> {
  const trimmed = token.trim();
  let pending = magicConsumeInflight.get(trimmed);
  if (!pending) {
    pending = tradieApi
      .consumeMagic(trimmed)
      .finally(() => magicConsumeInflight.delete(trimmed));
    magicConsumeInflight.set(trimmed, pending);
  }
  return pending;
}

export interface TradieMe {
  id: string;
  businessName: string;
  tradeTitle: string | null;
  town: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postcode: string | null;
  vatNumber: string | null;
  routeKey: string;
  status: string;
  trialEndsAt: string | null;
  accountActive: boolean;
  billingRequired?: boolean;
  onboardingRequired?: boolean;
  onboardingStep?: number;
  onboardingCompletedAt?: string | null;
  onboardingDivertConfirmedAt?: string | null;
  trialDays?: number;
  trialPricePence?: number;
  planPricePence?: number;
  destPhone: string;
  twilioNumber: string | null;
  greetingAudioUrl: string | null;
  missedCallMode: "SMS_QUALIFY" | "VOICEMAIL";
  inboundEmail: string | null;
  bankName: string | null;
  bankSortCode: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  googleReviewUrl: string | null;
  defaultDepositPercent: number;
  defaultTermsNote: string | null;
  /** What an hour costs the business. Null = own time, and job profit reads as take-home. */
  labourCostPerHourPence: number | null;
  logoUrl: string | null;
  stripeConnectOnboarded: boolean;
  stripeConnectAccountId: string | null;
  divertCodes: { noAnswer: string; busy: string; unreachable: string } | null;
  caps: { claude: boolean; whisper: boolean };
}

export const tradieApi = {
  signupStatus: async () => {
    const res = await fetch(apiUrl("/api/signup/status"));
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return res.json() as Promise<{ open: boolean }>;
  },

  requestEarlyAccess: (body: { email: string; phone: string; occupation: string }) =>
    signupRequest<{ ok: boolean; alreadyPending?: boolean }>("/early-access", body),

  getInvite: async (token: string) => {
    const res = await fetch(apiUrl(`/api/signup/invite/${encodeURIComponent(token)}`));
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const j = await res.json();
        message = j?.error?.message || message;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }
    return res.json() as Promise<{ email: string; phone: string; occupation: string; expiresAt: string }>;
  },

  signupStart: (body: {
    businessName: string;
    tradeTitle?: string;
    town?: string;
    phone: string;
    inviteToken?: string;
  }) => signupRequest<{ ok: boolean; expiresAt: string }>("/start", body),

  signupVerify: (body: { phone: string; code: string; inviteToken?: string }) =>
    signupRequest<{
      sessionToken: string;
      clientId: string;
      routeKey: string;
      status?: string;
      trialEndsAt: string | null;
      inboundEmail: string;
      checkoutUrl?: string;
      checkoutStub?: boolean;
    }>("/verify", body),

  loginStart: (phone: string) => signupRequest<{ ok: boolean }>("/login/start", { phone }),

  loginVerify: (body: { phone: string; code: string }) =>
    signupRequest<{ sessionToken: string; clientId: string; routeKey: string; status: string; trialEndsAt: string | null }>(
      "/login/verify",
      body
    ),

  requestMagic: (body: { routeKey?: string; phone?: string }) =>
    tRequest<{ ok: boolean }>("/auth/magic", { method: "POST", body: JSON.stringify(body) }),

  /** Seed accounts only (`seed_tm_*`) — creates a session without SMS. */
  seedLogin: (routeKey: string) =>
    tRequest<{ sessionToken: string; clientId: string; routeKey: string; businessName: string }>("/auth/seed-login", {
      method: "POST",
      body: JSON.stringify({ routeKey }),
    }),

  consumeMagic: (token: string) =>
    tRequest<MagicConsumeResult>("/auth/consume", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  me: () => tRequest<TradieMe>("/me"),

  updateMe: (patch: Record<string, unknown>) =>
    tRequest<{
      ok: boolean;
      id: string;
      missedCallMode?: "SMS_QUALIFY" | "VOICEMAIL";
      twilioHooks?: { voiceUrl: string; smsUrl: string; alreadyOk: boolean } | null;
      twilioHooksError?: string | null;
    }>("/me", { method: "PATCH", body: JSON.stringify(patch) }),

  twilioStatus: () =>
    tRequest<{
      configured: boolean;
      reason?: string;
      found?: boolean;
      phoneNumber?: string;
      voiceUrl?: string | null;
      smsUrl?: string | null;
      voiceOk?: boolean;
      smsOk?: boolean;
      expectedVoiceUrl?: string;
      expectedSmsUrl?: string;
    }>("/me/twilio"),

  configureTwilio: () =>
    tRequest<{ ok: boolean; phoneNumber: string; voiceUrl: string; smsUrl: string; alreadyOk: boolean }>(
      "/me/twilio/configure",
      { method: "POST", body: "{}" }
    ),

  uploadGreeting: (contentType: string, dataBase64: string) =>
    tRequest<{ ok: boolean; greetingAudioUrl: string | null }>("/me/greeting", {
      method: "POST",
      body: JSON.stringify({ contentType, dataBase64 }),
    }),

  deleteGreeting: () =>
    tRequest<{ ok: boolean; greetingAudioUrl: null }>("/me/greeting", { method: "DELETE" }),

  uploadLogo: (contentType: string, dataBase64: string, filename?: string) =>
    tRequest<{ ok: boolean; logoUrl: string }>("/me/logo", {
      method: "POST",
      body: JSON.stringify({ contentType, dataBase64, filename }),
    }),

  deleteLogo: () => tRequest<{ ok: boolean; logoUrl: null }>("/me/logo", { method: "DELETE" }),

  billingCheckout: () => tRequest<{ url: string; stub: boolean }>("/billing/checkout", { method: "POST", body: "{}" }),
  billingPortal: () => tRequest<{ url: string }>("/billing/portal", { method: "POST", body: "{}" }),

  onboarding: () =>
    tRequest<{
      step: number;
      lastStep: number;
      completed: boolean;
      divertConfirmed: boolean;
      testCallAt: string | null;
      twilioNumber: string | null;
      hasNumber: boolean;
      divertCodes: { noAnswer: string; busy: string; unreachable: string } | null;
      destPhone: string;
      businessName: string;
      tradeTitle: string | null;
      bank: {
        bankName: string | null;
        bankSortCode: string | null;
        bankAccountName: string | null;
        bankAccountNumber: string | null;
      };
      stripeConnectOnboarded: boolean;
      trialEndsAt: string | null;
      trialDays: number;
      trialPricePence: number;
      planPricePence: number;
      testCallDetected: boolean;
      recentMissedCalls: number;
      priceBookCount: number;
      hasRates: boolean;
      tradePreset: "plumber" | "electrician" | "heating";
      tradePresets: { id: "plumber" | "electrician" | "heating"; label: string }[];
      ratePreview: {
        sku: string | null;
        label: string;
        unit: string;
        unitPricePence: number;
        isCallout: boolean;
      }[];
      hasBankDetails: boolean;
      defaultDepositPercent: number;
      defaultTermsNote: string | null;
    }>("/onboarding"),

  onboardingProvisionNumber: () =>
    tRequest<{ phoneNumber: string | null; provisioned: boolean; error?: string }>("/onboarding/provision-number", {
      method: "POST",
      body: "{}",
    }),

  onboardingStep: (body: { step?: number; advance?: boolean }) =>
    tRequest<Record<string, unknown>>("/onboarding/step", { method: "POST", body: JSON.stringify(body) }),

  onboardingConfirmDivert: () =>
    tRequest<Record<string, unknown>>("/onboarding/confirm-divert", { method: "POST", body: "{}" }),

  onboardingConfirmTest: () =>
    tRequest<Record<string, unknown>>("/onboarding/confirm-test", { method: "POST", body: "{}" }),

  onboardingAlerts: (destPhone: string) =>
    tRequest<Record<string, unknown>>("/onboarding/alerts", {
      method: "PATCH",
      body: JSON.stringify({ destPhone }),
    }),

  onboardingTestAlert: (destPhone?: string) =>
    tRequest<{ ok: boolean; to: string }>("/onboarding/test-alert", {
      method: "POST",
      body: JSON.stringify(destPhone ? { destPhone } : {}),
    }),

  onboardingSeedRates: (
    tradePreset?: "plumber" | "electrician" | "heating",
    opts?: { replace?: boolean }
  ) =>
    tRequest<{
      seeded: number;
      alreadyHad: boolean;
      replaced?: boolean;
      count: number;
      items: {
        sku: string | null;
        label: string;
        unit: string;
        unitPricePence: number;
        isCallout: boolean;
      }[];
      onboarding: Record<string, unknown>;
    }>("/onboarding/seed-rates", {
      method: "POST",
      body: JSON.stringify({
        ...(tradePreset ? { tradePreset } : {}),
        ...(opts?.replace ? { replace: true } : {}),
      }),
    }),

  onboardingConfirmRates: () =>
    tRequest<Record<string, unknown>>("/onboarding/confirm-rates", { method: "POST", body: "{}" }),

  onboardingBank: (body: {
    bankName?: string;
    bankSortCode?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
  }) => tRequest<Record<string, unknown>>("/onboarding/bank", { method: "PATCH", body: JSON.stringify(body) }),

  onboardingComplete: () =>
    tRequest<Record<string, unknown>>("/onboarding/complete", { method: "POST", body: "{}" }),

  jobs: () =>
    tRequest<
      {
        id: string;
        name: string;
        phone: string;
        message: string | null;
        postcode: string | null;
        distanceMiles: number | null;
        photoUrls: string[];
        status: string;
        pipeline?: string;
        triage?: string;
        summary?: string | null;
        source?: string;
        createdAt: string;
        latestQuote: { id: string; status: string; totalPence: number } | null;
      }[]
    >("/jobs"),

  inbox: () =>
    tRequest<{
      needsYouCount: number;
      caughtSpamCount: number;
      items: {
        id: string;
        name: string;
        phone: string;
        email: string | null;
        message: string | null;
        addressLine: string | null;
        postcode: string | null;
        urgency: string | null;
        distanceMiles: number | null;
        source: string;
        triage: "LIKELY_JOB" | "QUOTE_SHOPPER" | "SPAM" | "UNKNOWN";
        summary: string | null;
        /** The whole missed-call exchange, oldest turn first. */
        conversation: { role: "assistant" | "user"; text: string; at: string | null }[];
        conversationSnippet: string | null;
        photoUrls: string[];
        createdAt: string;
      }[];
    }>("/inbox"),

  promoteJob: (enquiryId: string) =>
    tRequest<{ id: string; pipeline: string; triage: string; promotedAt: string | null }>(
      `/jobs/${enquiryId}/promote`,
      { method: "POST", body: "{}" }
    ),

  archiveJob: (enquiryId: string) =>
    tRequest<{ id: string; pipeline: string }>(`/jobs/${enquiryId}/archive`, {
      method: "POST",
      body: "{}",
    }),

  unarchiveJob: (enquiryId: string) =>
    tRequest<{ id: string; pipeline: string }>(`/jobs/${enquiryId}/unarchive`, {
      method: "POST",
      body: "{}",
    }),

  deleteJob: (enquiryId: string) =>
    tRequest<{ ok: boolean; id: string }>(`/jobs/${enquiryId}`, { method: "DELETE" }),

  killJob: (enquiryId: string, reason: "dead" | "spam") =>
    tRequest<{ id: string; pipeline: string; triage: string; killedAt: string | null }>(
      `/jobs/${enquiryId}/kill`,
      { method: "POST", body: JSON.stringify({ reason }) }
    ),

  createJob: (body: {
    name: string;
    phone: string;
    message?: string | null;
    postcode?: string | null;
  }) =>
    tRequest<{
      id: string;
      name: string;
      phone: string;
      message: string | null;
      postcode: string | null;
      status: string;
      pipeline?: string;
      triage?: string;
      source?: string;
      createdAt: string;
      latestQuote: null;
    }>("/jobs", { method: "POST", body: JSON.stringify(body) }),

  job: (id: string) => tRequest<Record<string, unknown>>(`/jobs/${id}`),

  jobMessages: (enquiryId: string) =>
    tRequest<
      {
        id: string;
        direction: string;
        channel: string;
        body: string;
        createdAt: string;
        toAddr: string;
        fromAddr: string | null;
      }[]
    >(`/jobs/${enquiryId}/messages`),

  sendJobMessage: (enquiryId: string, text: string) =>
    tRequest<{ ok: boolean; deliverOk: boolean }>(`/jobs/${enquiryId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  connectOnboard: (opts?: { returnPath?: string; refreshPath?: string }) =>
    tRequest<{ ok: boolean; onboarded: boolean; url: string | null }>("/connect/onboard", {
      method: "POST",
      body: JSON.stringify(opts ?? {}),
    }),

  connectStatus: () =>
    tRequest<{
      configured: boolean;
      onboarded: boolean;
      chargesEnabled: boolean;
      detailsSubmitted?: boolean;
    }>("/connect/status"),

  appointments: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const qs = q.toString();
    return tRequest<AppointmentDto[]>(`/appointments${qs ? `?${qs}` : ""}`);
  },

  createAppointment: (body: {
    enquiryId?: string | null;
    title: string;
    notes?: string | null;
    startsAt: string;
    endsAt: string;
    address?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    allowClash?: boolean;
  }) =>
    tRequest<{ appointment: AppointmentDto; clashes: AppointmentDto[] }>("/appointments", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  appointmentOnMyWay: (id: string) =>
    tRequest<{ appointment: AppointmentDto }>(`/appointments/${id}/on-my-way`, {
      method: "POST",
      body: "{}",
    }),

  patchAppointment: (id: string, body: { status?: string; notes?: string | null }) =>
    tRequest<AppointmentDto>(`/appointments/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  certificates: () => tRequest<CertificateDto[]>("/certificates"),

  createCertificate: (body: {
    kind: "GAS_SAFETY" | "MINOR_WORKS" | "EICR" | "OTHER";
    enquiryId?: string | null;
    siteAddress?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    customerEmail?: string | null;
    issuedAt?: string | null;
    schemeRef?: string | null;
    notes?: string | null;
    serviceDueAt?: string | null;
    file: { contentType: string; dataBase64: string };
  }) => tRequest<CertificateDto>("/certificates", { method: "POST", body: JSON.stringify(body) }),

  getCertificate: (id: string) => tRequest<CertificateDto>(`/certificates/${id}`),

  updateCertificate: (
    id: string,
    body: {
      kind?: "GAS_SAFETY" | "MINOR_WORKS" | "EICR" | "OTHER";
      siteAddress?: string | null;
      customerName?: string | null;
      customerPhone?: string | null;
      customerEmail?: string | null;
      issuedAt?: string | null;
      schemeRef?: string | null;
      notes?: string | null;
      serviceDueAt?: string | null;
      file?: { contentType: string; dataBase64: string } | null;
    }
  ) => tRequest<CertificateDto>(`/certificates/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  sendCertificate: (id: string) =>
    tRequest<CertificateDto>(`/certificates/${id}/send`, { method: "POST", body: "{}" }),

  notesToQuote: (enquiryId: string, transcript: string) =>
    tRequest<QuoteDto>(`/jobs/${enquiryId}/notes`, {
      method: "POST",
      body: JSON.stringify({ transcript }),
    }),

  voiceToQuote: (enquiryId: string, contentType: string, dataBase64: string, durationSec?: number) =>
    tRequest<{ voiceNoteId: string; transcript: string; quote: QuoteDto }>(`/jobs/${enquiryId}/voice`, {
      method: "POST",
      body: JSON.stringify({ contentType, dataBase64, durationSec }),
    }),

  quotes: () =>
    tRequest<
      {
        id: string;
        status: string;
        totalPence: number;
        sentAt: string | null;
        decidedAt: string | null;
        createdAt: string;
        publicUrl: string;
        enquiry: { id: string; name: string; phone: string; postcode: string | null } | null;
      }[]
    >("/quotes"),

  getQuote: (id: string) => tRequest<QuoteDto>(`/quotes/${id}`),

  saveLines: (
    id: string,
    body: {
      vatInclusive?: boolean;
      customerNote?: string | null;
      lines: { label: string; qty: number; unit: string; unitPricePence: number; vatRate: number }[];
    }
  ) => tRequest<QuoteDto>(`/quotes/${id}/lines`, { method: "PUT", body: JSON.stringify(body) }),

  approve: (
    id: string,
    body?: {
      depositPercent?: number;
      channels?: ("SMS" | "WHATSAPP" | "EMAIL")[];
      email?: string;
      message?: string;
    }
  ) =>
    tRequest<QuoteDto & { publicUrl: string }>(`/quotes/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),

  deleteQuote: (id: string) => tRequest<{ ok: boolean }>(`/quotes/${id}`, { method: "DELETE" }),

  quoteTemplates: () => tRequest<QuoteTemplateSummary[]>("/templates"),

  quoteTemplate: (id: string) => tRequest<QuoteTemplateDetail>(`/templates/${id}`),

  deleteTemplate: (id: string) => tRequest<{ ok: boolean }>(`/templates/${id}`, { method: "DELETE" }),

  createQuote: (body: {
    id: string;
    templateId?: string;
    lines: { label: string; qty: number; unit: string; unitPricePence: number; vatRate: number }[];
  }) => tRequest<QuoteDto>("/quotes", { method: "POST", body: JSON.stringify(body) }),

  saveQuoteTerms: (
    id: string,
    body: {
      depositPercent?: number;
      validDays?: number;
      earliestStartAt?: string | null;
      estimatedDuration?: string | null;
      termsNote?: string | null;
    }
  ) => tRequest<QuoteDto>(`/quotes/${id}/terms`, { method: "PATCH", body: JSON.stringify(body) }),

  setQuoteCustomer: (
    id: string,
    body: { enquiryId?: string; name?: string; phone?: string; email?: string | null }
  ) => tRequest<QuoteDto>(`/quotes/${id}/customer`, { method: "PATCH", body: JSON.stringify(body) }),

  archiveQuote: (id: string) =>
    tRequest<{ id: string; status: string }>(`/quotes/${id}/archive`, {
      method: "POST",
      body: "{}",
    }),

  unarchiveQuote: (id: string) =>
    tRequest<{ id: string; status: string }>(`/quotes/${id}/unarchive`, {
      method: "POST",
      body: "{}",
    }),

  archived: () =>
    tRequest<{
      jobs: {
        id: string;
        name: string;
        phone: string;
        message: string | null;
        postcode: string | null;
        distanceMiles: number | null;
        createdAt: string;
        title: string;
        operational: string;
        commercial: string;
        archivedAt: string | null;
        latestQuote: { id: string; status: string; totalPence: number } | null;
      }[];
      quotes: {
        id: string;
        status: string;
        statusBeforeArchive: string | null;
        totalPence: number;
        sentAt: string | null;
        createdAt: string;
        enquiry: { id: string; name: string; phone: string; postcode: string | null } | null;
      }[];
    }>("/archived"),

  invoices: () => tRequest<InvoiceDto[]>("/invoices"),

  invoiceFromQuote: (quoteId: string) =>
    tRequest<InvoiceDto>(`/invoices/from-quote/${quoteId}`, { method: "POST", body: "{}" }),

  sendInvoice: (id: string) =>
    tRequest<{ invoice: InvoiceDto; publicUrl: string }>(`/invoices/${id}/send`, { method: "POST", body: "{}" }),

  markInvoicePaid: (id: string) =>
    tRequest<InvoiceDto>(`/invoices/${id}/mark-paid`, { method: "POST", body: "{}" }),

  customers: () =>
    tRequest<
      {
        phone: string;
        phoneKey: string;
        name: string;
        jobCount: number;
        lastJobAt: string;
        lastEnquiryId: string | null;
        latestQuote: { id: string; status: string; totalPence: number } | null;
      }[]
    >("/customers"),

  createCustomer: (body: { name: string; phone: string; notes?: string | null }) =>
    tRequest<{
      phoneKey: string;
      phone: string;
      name: string;
      notes: string;
      jobCount: number;
    }>("/customers", { method: "POST", body: JSON.stringify(body) }),

  customer: (phoneKey: string) =>
    tRequest<CustomerProfile>(`/customers/${encodeURIComponent(phoneKey)}`),

  updateCustomer: (
    phoneKey: string,
    body: { notes?: string; plantNotes?: string; name?: string }
  ) =>
    tRequest<{ ok: boolean; notes: string; plantNotes: string; name: string | null }>(
      `/customers/${encodeURIComponent(phoneKey)}`,
      { method: "PATCH", body: JSON.stringify(body) }
    ),

  priceBook: () => tRequest<PriceBookItem[]>(`/price-book`),

  savePriceBook: (items: Partial<PriceBookItem>[]) =>
    tRequest<PriceBookItem[]>(`/price-book`, { method: "PUT", body: JSON.stringify({ items }) }),

  importPriceBook: (rows: {
    sku?: string | null;
    label: string;
    category?: string | null;
    unit?: string;
    unitPriceGbp?: number;
    vatRate?: number;
    isCallout?: boolean;
    active?: boolean;
  }[]) =>
    tRequest<{ created: number; updated: number; skipped: number; items: PriceBookItem[] }>(
      `/price-book/import`,
      { method: "POST", body: JSON.stringify({ rows }) }
    ),

  deactivatePriceBookItem: (id: string) =>
    tRequest<PriceBookItem>(`/price-book/${id}`, { method: "DELETE" }),
};

export interface InvoiceDto {
  id: string;
  status: string;
  totalPence: number;
  amountDuePence?: number;
  depositAppliedPence?: number;
  reference: string | null;
  customerName: string | null;
  customerPhone: string | null;
  publicUrl?: string;
  publicToken: string;
  dueDate: string | null;
  paidAt: string | null;
  paidReportedAt: string | null;
  createdAt: string;
  lines?: { label: string; qty: number; unitPricePence: number }[];
}

export interface AppointmentDto {
  id: string;
  title: string;
  notes: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  address: string | null;
  customerName: string | null;
  customerPhone: string | null;
  enquiryId: string | null;
  enquiry?: { id: string; name: string; phone: string; postcode: string | null } | null;
}

export interface CertificateDto {
  id: string;
  kind: string;
  status: string;
  siteAddress: string | null;
  customerName: string | null;
  customerPhone: string | null;
  formData: Record<string, unknown>;
  issuedAt: string | null;
  schemeRef: string | null;
  signatureDataUrl: string | null;
  signedAt: string | null;
  pdfUrl: string | null;
  fileContentType: string | null;
  publicToken: string;
  serviceDueAt: string | null;
  createdAt: string;
}

export interface QuoteLineDto {
  id?: string;
  label: string;
  qty: number;
  unit: string;
  unitPricePence: number;
  vatRate: number;
  source?: string;
  priceBookItemId?: string | null;
  priceBookItem?: { id: string; sku: string | null; label: string } | null;
}

export interface QuoteDto {
  id: string;
  status: string;
  vatInclusive: boolean;
  subtotalPence: number;
  vatPence: number;
  totalPence: number;
  customerNote: string | null;
  assumptions: string | null;
  publicToken: string;
  publicUrl?: string;
  reference: string | null;
  depositPercent: number;
  depositPence: number;
  validDays: number;
  earliestStartAt: string | null;
  estimatedDuration: string | null;
  termsNote: string | null;
  enquiry?: { id: string; name: string; phone: string; email: string | null } | null;
  lines: QuoteLineDto[];
}

export interface QuoteTemplateSummary {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  lastUsedAt: string | null;
  updatedAt: string;
  tags: string[];
  useForAiDrafting: boolean;
  itemCount: number;
  addOnCount: number;
}

export interface TemplateItemInput {
  label: string;
  qty: number;
  unit: string;
  unitPricePence: number;
  vatRate: number;
  isAddOn: boolean;
  priceBookItemId?: string | null;
}

export interface TemplateDraft {
  name: string;
  category?: string | null;
  description?: string | null;
  tags?: string[];
  defaultDurationMins?: number | null;
  useForAiDrafting?: boolean;
  vatRate?: number;
  depositPercent?: number | null;
  notes?: string | null;
  items?: TemplateItemInput[];
}

export interface QuoteTemplateItemDto {
  id: string;
  label: string;
  qty: number;
  unit: string;
  unitPricePence: number;
  vatRate: number;
  isAddOn: boolean;
}

export interface QuoteTemplateDetail {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  tags: string[];
  defaultDurationMins: number | null;
  useForAiDrafting: boolean;
  vatRate: number;
  depositPercent: number | null;
  notes: string | null;
  included: QuoteTemplateItemDto[];
  addOns: QuoteTemplateItemDto[];
}

export interface PriceBookItem {
  id: string;
  label: string;
  sku: string | null;
  /** SERVICE | MATERIAL | LABOUR | CALLOUT | OTHER — see lib/rateCategories. */
  category: string | null;
  unit: string;
  unitPricePence: number;
  /**
   * What it costs the tradie, ex VAT. Null means not recorded — which is not
   * the same as free, and is why job profit reports itself as provisional
   * rather than claiming an unpriced part as pure margin.
   */
  costPricePence: number | null;
  vatRate: number;
  isCallout: boolean;
  active: boolean;
}

export interface CustomerProfile {
  phoneKey: string;
  phone: string;
  name: string;
  postcode: string | null;
  notes: string;
  plantNotes: string;
  jobCount: number;
  totals: { paidPence: number; openPence: number };
  jobs: {
    id: string;
    name: string;
    message: string | null;
    postcode: string | null;
    status: string;
    source: string;
    createdAt: string;
    latestQuote: { id: string; status: string; totalPence: number } | null;
  }[];
  invoices: {
    id: string;
    status: string;
    totalPence: number;
    amountDuePence: number;
    reference: string | null;
    paidAt: string | null;
    createdAt: string;
    enquiryId: string | null;
  }[];
  appointments: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    status: string;
    address: string | null;
    enquiryId: string | null;
  }[];
  certificates: {
    id: string;
    kind: string;
    status: string;
    siteAddress: string | null;
    serviceDueAt: string | null;
    createdAt: string;
    enquiryId: string | null;
  }[];
}

export function formatGbp(pence: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}
