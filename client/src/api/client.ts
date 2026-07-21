import type { Lead, LeadFilters, LeadsResponse, SearchSummary, JobProgress } from "../types";
import { searchWithProgress } from "./sse";
import { apiUrl } from "./base";
import { getOperatorToken } from "../lib/operatorAuth";

function operatorHeaders(): Record<string, string> {
  const token = getOperatorToken();
  return token ? { Authorization: `Bearer ${token}`, "x-operator-token": token } : {};
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const fullUrl = apiUrl(url);
  const res = await fetch(fullUrl, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...operatorHeaders(),
      ...(init?.headers || {}),
    },
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
  twilioUkBundleSid?: SettingsField;
  twilioUkAddressSid?: SettingsField;
  claudeApiKey: SettingsField;
  openaiApiKey: SettingsField;
  missedCallSayVoice: string;
  missedCallSayText: string;
  missedCallSmsText: string;
}

export interface SettingsUpdate {
  googlePlacesApiKey?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioSmsFrom?: string;
  twilioWhatsappFrom?: string;
  twilioUkBundleSid?: string;
  twilioUkAddressSid?: string;
  claudeApiKey?: string;
  openaiApiKey?: string;
  missedCallSayVoice?: string;
  missedCallSayText?: string;
  missedCallSmsText?: string;
}

export interface DashboardStats {
  generatedAt: string;
  period: {
    last7DaysFrom: string;
    last30DaysFrom: string;
    monthStart: string;
  };
  kpis: {
    clients: {
      active: number;
      trial: number;
      pastDue: number;
      suspended: number;
      cancelled: number;
      total: number;
      trialsEndingSoon7d: number;
    };
    earlyAccess: {
      pending: number;
      approved: number;
      denied: number;
      signedUp: number;
    };
    enquiries: {
      total: number;
      last7Days: number;
      last30Days: number;
      routed30: number;
      held30: number;
      failed30: number;
    };
    missedCalls: {
      total: number;
      pending: number;
      qualifying: number;
      converted: number;
      spam: number;
      expired: number;
      last30Days: number;
      converted30: number;
      conversionRate30: number | null;
    };
    quotes: {
      draft: number;
      sent: number;
      accepted: number;
      declined: number;
      expired: number;
      sent30: number;
      accepted30: number;
    };
    invoices: {
      draft: number;
      sent: number;
      paid: number;
      overdue: number;
    };
    pipeline: {
      leadsTotal: number;
      leadsInPlay: number;
      searchRuns30: number;
    };
  };
  billableRevenue: {
    currency: string;
    planPricePence: number;
    saasMrrPence: number;
    saasAtRiskMrrPence: number;
    saasTrialPipelinePence: number;
    payingClients: number;
    activeClients: number;
    trialClients: number;
    jobInvoicesPaidTotalPence: number;
    jobInvoicesPaidTotalCount: number;
    jobInvoicesPaidMonthPence: number;
    jobInvoicesPaidMonthCount: number;
    jobInvoicesOutstandingPence: number;
    jobInvoicesOutstandingCount: number;
    note: string;
  };
  costings: {
    currency: string;
    periodDays: number;
    estimated: boolean;
    ratesPence: Record<string, number>;
    usage30: {
      smsOutbound: number;
      whatsappOutbound: number;
      emailOutbound: number;
      systemOutbound: number;
      messagesOutboundTotal: number;
      missedCalls: number;
      voiceNotes: number;
    };
    messagingPence: number;
    voiceAndAiPence: number;
    totalPence: number;
    note: string;
  };
}

export type DashboardKpiKey =
  | "active-clients"
  | "early-access"
  | "enquiries"
  | "missed-calls"
  | "quotes"
  | "invoices-overdue"
  | "trials-ending"
  | "leads-in-play"
  | "saas-mrr"
  | "at-risk-mrr"
  | "trial-pipeline"
  | "invoices-paid-month"
  | "invoices-paid-all"
  | "invoices-outstanding"
  | "costings"
  | "costings-messaging"
  | "costings-voice";

export type DashboardClientRow = {
  id: string;
  businessName: string;
  status: string;
  destPhone: string;
  destChannel: string;
  trialEndsAt: string | null;
  town: string | null;
  tradeTitle: string | null;
  createdAt: string;
};

export type DashboardEarlyAccessRow = {
  id: string;
  email: string;
  phone: string;
  occupation: string;
  status: string;
  createdAt: string;
};

export type DashboardEnquiryRow = {
  id: string;
  name: string;
  phone: string;
  message: string | null;
  postcode: string | null;
  source: string;
  status: string;
  createdAt: string;
  client: { id: string; businessName: string; status: string };
};

export type DashboardMissedCallRow = {
  id: string;
  callerPhone: string;
  status: string;
  enquiryId: string | null;
  callSid: string | null;
  createdAt: string;
  updatedAt: string;
  client: { id: string; businessName: string; status: string };
};

export type DashboardQuoteRow = {
  id: string;
  status: string;
  totalPence: number;
  sentAt: string | null;
  decidedAt: string | null;
  customerName: string | null;
  customerPhone: string | null;
  publicUrl: string;
  client: { id: string; businessName: string; status: string };
};

export type DashboardInvoiceRow = {
  id: string;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  totalPence: number;
  dueDate: string | null;
  sentAt: string | null;
  paidAt: string | null;
  publicUrl: string;
  client: { id: string; businessName: string; status: string };
};

export type DashboardLeadRow = {
  id: string;
  businessName: string;
  occupation: string;
  town: string;
  phone: string | null;
  outreachStatus: string;
  qualified: boolean;
  createdAt: string;
};

export type DashboardMessageRow = {
  id: string;
  channel: string;
  toAddr: string;
  status: string;
  twilioSid: string | null;
  bodyPreview: string;
  createdAt: string;
  client: { id: string; businessName: string };
};

export type DashboardDetails =
  | {
      kpi: DashboardKpiKey;
      kind: "clients";
      title: string;
      description: string;
      total: number;
      rows: DashboardClientRow[];
    }
  | {
      kpi: DashboardKpiKey;
      kind: "early-access";
      title: string;
      description: string;
      total: number;
      rows: DashboardEarlyAccessRow[];
    }
  | {
      kpi: DashboardKpiKey;
      kind: "enquiries";
      title: string;
      description: string;
      total: number;
      rows: DashboardEnquiryRow[];
    }
  | {
      kpi: DashboardKpiKey;
      kind: "missed-calls";
      title: string;
      description: string;
      total: number;
      rows: DashboardMissedCallRow[];
    }
  | {
      kpi: DashboardKpiKey;
      kind: "quotes";
      title: string;
      description: string;
      total: number;
      rows: DashboardQuoteRow[];
    }
  | {
      kpi: DashboardKpiKey;
      kind: "invoices";
      title: string;
      description: string;
      total: number;
      rows: DashboardInvoiceRow[];
    }
  | {
      kpi: DashboardKpiKey;
      kind: "leads";
      title: string;
      description: string;
      total: number;
      rows: DashboardLeadRow[];
    }
  | {
      kpi: DashboardKpiKey;
      kind: "messages";
      title: string;
      description: string;
      total: number;
      rows: DashboardMessageRow[];
      links?: { label: string; href: string }[];
    };

export interface TwilioUsageBlock {
  totalPrice: string | null;
  priceUnit: string;
  startDate: string | null;
  endDate: string | null;
  records: {
    category: string;
    description: string;
    count: string;
    countUnit: string;
    usage: string;
    usageUnit: string;
    price: string;
    priceUnit: string;
    startDate: string;
    endDate: string;
  }[];
}

export interface TwilioAdminStats {
  generatedAt: string;
  configured: boolean;
  twilioError: string | null;
  account: {
    sidHint: string | null;
    friendlyName: string | null;
    status: string | null;
    type: string | null;
    smsFrom: string | null;
    whatsappFrom: string | null;
    expectedVoiceUrl: string;
    expectedSmsUrl: string;
  };
  balance: { currency: string; balance: string } | null;
  numbers: {
    totalOnTwilio: number;
    assignedToClients: number;
    unassignedCount: number;
    clientsWithNumberMissingOnTwilio: number;
    rows: {
      sid: string;
      phoneNumber: string;
      friendlyName: string | null;
      capabilities: { voice: boolean; sms: boolean; mms: boolean };
      dateCreated: string | null;
      voiceUrl: string | null;
      smsUrl: string | null;
      voiceOk: boolean;
      smsOk: boolean;
      webhooksOk: boolean;
      assignedClient: {
        id: string;
        businessName: string;
        status: string;
        missedCallMode: string;
        destChannel: string;
      } | null;
    }[];
    clientsMissing: {
      id: string;
      businessName: string;
      status: string;
      twilioNumber: string | null;
      missedCallMode: string;
    }[];
  };
  usage: {
    today: TwilioUsageBlock;
    thisMonth: TwilioUsageBlock;
    lastMonth: TwilioUsageBlock;
  };
  local: {
    messages7d: { byKey: Record<string, number>; total: number };
    messages30d: { byKey: Record<string, number>; total: number };
    outboundWithTwilioSid30: number;
    failedOrUndelivered30: number;
    missedCalls30: number;
    missedByStatus30: Record<string, number>;
    estimatedCost30: {
      currency: string;
      totalPence: number;
      note: string;
      breakdown: {
        smsOutbound: number;
        whatsappOutbound: number;
        missedCallSessions: number;
      };
    };
  };
}

export const api = {
  health: () =>
    request<{
      ok: boolean;
      placesConfigured: boolean;
      publicBaseUrl: string;
      operatorAuthRequired?: boolean;
      signupsOpen?: boolean;
    }>("/api/health"),

  operatorSession: () => request<{ ok: boolean; authRequired: boolean }>("/api/operator/session"),

  operatorLogin: async (password: string) => {
    const fullUrl = apiUrl("/api/operator/login");
    const res = await fetch(fullUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(`API returned non-JSON (${res.status}) from ${fullUrl}`);
    }
    const body = (await res.json()) as {
      ok?: boolean;
      open?: boolean;
      sessionToken?: string | null;
      expiresAt?: string | null;
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(body?.error?.message || `Login failed (${res.status})`);
    }
    return {
      ok: true as const,
      open: !!body.open,
      sessionToken: body.sessionToken ?? null,
      expiresAt: body.expiresAt ?? null,
    };
  },

  getSettings: () => request<SettingsView>("/api/settings"),

  getDashboard: () => request<DashboardStats>("/api/dashboard"),

  getDashboardDetails: (kpi: DashboardKpiKey) =>
    request<DashboardDetails>(`/api/dashboard/details?kpi=${encodeURIComponent(kpi)}`),

  patchDashboardMissedCall: (id: string, status: string) =>
    request<{ ok: boolean; row: DashboardMissedCallRow }>(`/api/dashboard/missed-calls/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  patchDashboardInvoice: (id: string, status: "SENT" | "PAID" | "OVERDUE" | "VOID") =>
    request<{ ok: boolean; row: DashboardInvoiceRow }>(`/api/dashboard/invoices/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  getTwilioAdmin: () => request<TwilioAdminStats>("/api/twilio-admin"),

  listEarlyAccess: (status?: string) =>
    request<
      {
        id: string;
        email: string;
        phone: string;
        occupation: string;
        status: string;
        inviteExpiresAt: string | null;
        inviteSentAt: string | null;
        inviteUsedAt: string | null;
        reviewedAt: string | null;
        createdAt: string;
      }[]
    >(`/api/early-access${status ? `?status=${encodeURIComponent(status)}` : ""}`),

  approveEarlyAccess: (id: string) =>
    request<{ ok: boolean; id: string; inviteExpiresAt: string; inviteUrl: string }>(
      `/api/early-access/${id}/approve`,
      { method: "POST", body: "{}" }
    ),

  denyEarlyAccess: (id: string) =>
    request<{ ok: boolean; id: string; status: string }>(`/api/early-access/${id}/deny`, {
      method: "POST",
      body: "{}",
    }),

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
