import { apiUrl } from "./base";

const SESSION_KEY = "tm_tradie_session";

export function getTradieSession(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function setTradieSession(token: string | null) {
  if (token) localStorage.setItem(SESSION_KEY, token);
  else localStorage.removeItem(SESSION_KEY);
}

async function tRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getTradieSession();
  const res = await fetch(apiUrl(`/api/t${path}`), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body?.error?.message || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
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
  routeKey: string;
  status: string;
  trialEndsAt: string | null;
  accountActive: boolean;
  twilioNumber: string | null;
  inboundEmail: string | null;
  bankName: string | null;
  bankSortCode: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  divertCodes: { noAnswer: string; busy: string; unreachable: string } | null;
  caps: { claude: boolean; whisper: boolean };
}

export const tradieApi = {
  signupStart: (body: { businessName: string; tradeTitle?: string; town?: string; phone: string }) =>
    signupRequest<{ ok: boolean; expiresAt: string }>("/start", body),

  signupVerify: (body: { phone: string; code: string }) =>
    signupRequest<{
      sessionToken: string;
      clientId: string;
      routeKey: string;
      trialEndsAt: string;
      inboundEmail: string;
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
    tRequest<{ ok: boolean }>("/me", { method: "PATCH", body: JSON.stringify(patch) }),

  billingCheckout: () => tRequest<{ url: string; stub: boolean }>("/billing/checkout", { method: "POST", body: "{}" }),

  jobs: () =>
    tRequest<
      {
        id: string;
        name: string;
        phone: string;
        message: string | null;
        postcode: string | null;
        photoUrls: string[];
        createdAt: string;
        latestQuote: { id: string; status: string; totalPence: number } | null;
      }[]
    >("/jobs"),

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

  approve: (id: string) =>
    tRequest<QuoteDto & { publicUrl: string }>(`/quotes/${id}/approve`, { method: "POST", body: "{}" }),

  deleteQuote: (id: string) => tRequest<{ ok: boolean }>(`/quotes/${id}`, { method: "DELETE" }),

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
        name: string;
        jobCount: number;
        lastJobAt: string;
        lastEnquiryId: string;
        latestQuote: { id: string; status: string; totalPence: number } | null;
      }[]
    >("/customers"),

  priceBook: () => tRequest<PriceBookItem[]>(`/price-book`),

  savePriceBook: (items: Partial<PriceBookItem>[]) =>
    tRequest<PriceBookItem[]>(`/price-book`, { method: "PUT", body: JSON.stringify({ items }) }),

  importPriceBook: (rows: {
    sku?: string | null;
    label: string;
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
  lines: QuoteLineDto[];
}

export interface PriceBookItem {
  id: string;
  label: string;
  sku: string | null;
  unit: string;
  unitPricePence: number;
  vatRate: number;
  isCallout: boolean;
  active: boolean;
}

export function formatGbp(pence: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}
