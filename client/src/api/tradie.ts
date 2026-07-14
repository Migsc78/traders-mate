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

type MagicConsumeResult = {
  sessionToken: string;
  clientId: string;
  caps: { claude: boolean; whisper: boolean };
};

/** Dedupes in-flight consume calls (React StrictMode mounts effects twice in dev). */
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

export const tradieApi = {
  requestMagic: (body: { routeKey?: string; phone?: string }) =>
    tRequest<{ ok: boolean }>("/auth/magic", { method: "POST", body: JSON.stringify(body) }),

  consumeMagic: (token: string) =>
    tRequest<MagicConsumeResult>("/auth/consume", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  me: () =>
    tRequest<{
      id: string;
      businessName: string;
      tradeTitle: string | null;
      town: string | null;
      routeKey: string;
      caps: { claude: boolean; whisper: boolean };
    }>("/me"),

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
