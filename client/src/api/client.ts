import type { Lead, LeadFilters, LeadsResponse, SearchSummary, JobProgress } from "../types";
import { searchWithProgress } from "./sse";
import { apiUrl } from "./base";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const fullUrl = apiUrl(url);
  const res = await fetch(fullUrl, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const base = String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
    throw new Error(
      !base
        ? "API returned HTML instead of JSON — set VITE_API_BASE on Vercel to your Railway URL and redeploy."
        : `API returned non-JSON (${res.status}) from ${fullUrl}. Open ${base}/api/health — you should see {"ok":true}. If that fails, VITE_API_BASE is wrong or the Railway API is down.`
    );
  }
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

export interface SearchInput {
  occupation: string;
  town?: string;
  center?: { lat: number; lng: number };
  radiusM?: number;
  maxResults?: number;
}

export interface SettingsField {
  configured: boolean;
  hint: string | null;
}

export interface SettingsView {
  googlePlacesApiKey: SettingsField;
  twilioAccountSid: SettingsField;
  twilioAuthToken: SettingsField;
  twilioSmsFrom: SettingsField;
  twilioWhatsappFrom: SettingsField;
  claudeApiKey: SettingsField;
  openaiApiKey: SettingsField;
}

export interface SettingsUpdate {
  googlePlacesApiKey?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioSmsFrom?: string;
  twilioWhatsappFrom?: string;
  claudeApiKey?: string;
  openaiApiKey?: string;
}

export const api = {
  health: () => request<{ ok: boolean; placesConfigured: boolean; publicBaseUrl: string }>("/api/health"),

  getSettings: () => request<SettingsView>("/api/settings"),

  updateSettings: (patch: SettingsUpdate) =>
    request<SettingsView>("/api/settings", { method: "PUT", body: JSON.stringify(patch) }),

  search: (input: SearchInput) =>
    request<SearchSummary>("/api/search", { method: "POST", body: JSON.stringify(input) }),

  searchWithProgress: (input: SearchInput, onProgress?: (progress: JobProgress) => void) =>
    searchWithProgress(input as unknown as Record<string, unknown>, onProgress),

  refreshLeadsWithProgress: async (
    ids: string[],
    onProgress?: (progress: JobProgress) => void
  ): Promise<{ refreshed: number; failed: number; errors?: string[] }> => {
    const total = ids.length;
    let refreshed = 0;
    const errors: string[] = [];

    for (let i = 0; i < ids.length; i++) {
      const current = i + 1;
      onProgress?.({
        phase: "process",
        current: i,
        total,
        message: `Refreshing lead ${current} of ${total}…`,
        percent: Math.round((i / Math.max(total, 1)) * 100),
      });

      try {
        await request<Lead>(`/api/leads/${ids[i]}/refresh`, { method: "POST" });
        refreshed += 1;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Refresh failed");
      }

      onProgress?.({
        phase: "process",
        current,
        total,
        message: `Refreshed ${current} of ${total}`,
        percent: Math.round((current / Math.max(total, 1)) * 100),
      });
    }

    return { refreshed, failed: total - refreshed, errors: errors.length ? errors : undefined };
  },

  listLeads: (filters: LeadFilters) => {
    const p = new URLSearchParams();
    if (filters.websiteClass.length) p.set("websiteClass", filters.websiteClass.join(","));
    if (filters.minReviews != null) p.set("minReviews", String(filters.minReviews));
    if (filters.minRating != null) p.set("minRating", String(filters.minRating));
    if (filters.minScore != null) p.set("minScore", String(filters.minScore));
    if (filters.occupation) p.set("occupation", filters.occupation);
    if (filters.town) p.set("town", filters.town);
    if (filters.status) p.set("status", filters.status);
    if (filters.searchRunId) p.set("searchRunId", filters.searchRunId);
    p.set("qualified", String(filters.qualified));
    p.set("sort", filters.sort);
    p.set("order", filters.order);
    p.set("page", String(filters.page));
    p.set("pageSize", String(filters.pageSize));
    return request<LeadsResponse>(`/api/leads?${p.toString()}`);
  },

  getLead: (id: string) => request<Lead>(`/api/leads/${id}`),

  updateLead: (id: string, patch: Partial<Pick<Lead, "outreachStatus" | "notes" | "email">> & { tpsCheckedAt?: string | null }) =>
    request<Lead>(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  refreshLead: (id: string) => request<Lead>(`/api/leads/${id}/refresh`, { method: "POST" }),

  bulkRefreshLeads: (ids: string[]) =>
    request<{ refreshed: number; failed: number; errors?: string[] }>("/api/leads/bulk/refresh", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  bulkMarkScreened: (ids: string[]) =>
    request<{ updated: number }>("/api/leads/bulk/mark-screened", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  generateSite: (id: string) =>
    request<{ slug: string; previewUrl: string }>(`/api/leads/${id}/site`, { method: "POST", body: JSON.stringify({}) }),

  downloadSiteUrl: (id: string) => apiUrl(`/api/leads/${id}/site/html`),

  listClients: () => request<import("../types").Client[]>("/api/clients"),

  getClient: (id: string) => request<import("../types").Client>(`/api/clients/${id}`),

  createClient: (body: {
    businessName: string;
    tradeTitle?: string;
    town?: string;
    postcode?: string;
    destPhone: string;
    destChannel?: string;
    status?: string;
  }) =>
    request<import("../types").Client>("/api/clients", { method: "POST", body: JSON.stringify(body) }),

  convertLead: (leadId: string, body?: { destPhone?: string; destChannel?: string }) =>
    request<import("../types").Client & { siteRegenerated?: boolean; previewUrl?: string }>(
      `/api/clients/from-lead/${leadId}`,
      {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      }
    ),

  updateClient: (id: string, patch: Partial<import("../types").Client>) =>
    request<import("../types").Client>(`/api/clients/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  rebuildClientSite: (id: string) =>
    request<{ slug: string; previewUrl: string; siteSlug: string; sitePreviewUrl: string }>(
      `/api/clients/${id}/rebuild-site`,
      { method: "POST", body: JSON.stringify({}) }
    ),

  deleteClient: (id: string) => request<{ ok: boolean }>(`/api/clients/${id}`, { method: "DELETE" }),

  bulkDeleteClients: (ids: string[]) =>
    request<{ deleted: number }>("/api/clients/bulk/delete", { method: "POST", body: JSON.stringify({ ids }) }),

  bulkSetClientStatus: (ids: string[], status: import("../types").ClientStatus) =>
    request<{ updated: number }>("/api/clients/bulk/status", {
      method: "POST",
      body: JSON.stringify({ ids, status }),
    }),

  sendClientInvoice: (id: string) =>
    request<{ url: string; stub: boolean; delivered: boolean }>(`/api/clients/${id}/send-invoice`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  bulkSendClientInvoices: (ids: string[]) =>
    request<{ sent: number; results: { id: string; ok: boolean; delivered?: boolean; error?: string }[] }>(
      "/api/clients/bulk/send-invoice",
      { method: "POST", body: JSON.stringify({ ids }) }
    ),

  listClientPriceBook: (id: string) =>
    request<import("../lib/priceBookFile").PriceBookRow[]>(`/api/clients/${id}/price-book`),

  saveClientPriceBook: (id: string, items: import("../lib/priceBookFile").PriceBookRow[]) =>
    request<import("../lib/priceBookFile").PriceBookRow[]>(`/api/clients/${id}/price-book`, {
      method: "PUT",
      body: JSON.stringify({ items }),
    }),

  importClientPriceBook: (id: string, rows: import("../lib/priceBookFile").PriceBookImportRow[]) =>
    request<{
      created: number;
      updated: number;
      skipped: number;
      items: import("../lib/priceBookFile").PriceBookRow[];
    }>(`/api/clients/${id}/price-book/import`, {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),

  deactivateClientPriceBookItem: (id: string, itemId: string) =>
    request<import("../lib/priceBookFile").PriceBookRow>(`/api/clients/${id}/price-book/${itemId}`, {
      method: "DELETE",
    }),

  listClientQuotes: (id: string) => request<unknown[]>(`/api/clients/${id}/quotes`),

  listClientAssets: (id: string) => request<import("../types").ClientAsset[]>(`/api/clients/${id}/assets`),

  uploadClientAsset: (
    id: string,
    body: {
      kind: import("../types").ClientAssetKind;
      contentType: string;
      dataBase64: string;
      caption?: string;
      filename?: string;
    }
  ) =>
    request<import("../types").ClientAsset>(`/api/clients/${id}/assets`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateClientAsset: (
    id: string,
    assetId: string,
    patch: { kind?: import("../types").ClientAssetKind; caption?: string | null; sort?: number }
  ) =>
    request<import("../types").ClientAsset>(`/api/clients/${id}/assets/${assetId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteClientAsset: (id: string, assetId: string) =>
    request<{ ok: boolean }>(`/api/clients/${id}/assets/${assetId}`, { method: "DELETE" }),

  billingCheckout: (id: string) =>
    request<{ url: string; stub: boolean }>(`/api/billing/checkout/${id}`, { method: "POST", body: JSON.stringify({}) }),

  exportCsv: async (ids?: string[]) => {
    const res = await fetch(apiUrl("/api/leads/export"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  },
};
