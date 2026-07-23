import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Channel, Client, ClientAsset, ClientAssetKind, ClientStatus, Enquiry } from "../types";
import { CHANNELS, CLIENT_ASSET_KINDS, CLIENT_STATUSES } from "../types";
import PriceBookEditor from "../components/PriceBookEditor";

const TABS = [
  { id: "account", label: "Account" },
  { id: "billing", label: "Billing" },
  { id: "leads", label: "Leads" },
  { id: "quotes", label: "Quotes" },
  { id: "pricebook", label: "Price book" },
  { id: "messages", label: "Messages" },
  { id: "website", label: "Website" },
  { id: "assets", label: "Assets" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const ENQUIRY_STATUS: Record<string, string> = {
  ROUTED: "badge green",
  HELD: "badge amber",
  FAILED: "badge red",
};

const QUOTE_STATUS: Record<string, string> = {
  DRAFT: "badge grey",
  SENT: "badge navy",
  ACCEPTED: "badge green",
  DECLINED: "badge red",
  EXPIRED: "badge amber",
};

function formatGbp(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function isTab(v: string | null): v is TabId {
  return TABS.some((t) => t.id === v);
}

export default function ClientDetailPage() {
  const { clientId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab: TabId = isTab(params.get("tab")) ? (params.get("tab") as TabId) : "account";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: client, isLoading, isError, error } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => api.getClient(clientId),
    enabled: !!clientId,
  });
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: () => api.health() });

  const [draft, setDraft] = useState<Partial<Client>>({});
  const [uploadKind, setUploadKind] = useState<ClientAssetKind>("SHOWCASE");
  const [uploadCaption, setUploadCaption] = useState("");
  const [assetNotice, setAssetNotice] = useState("");

  const value = <K extends keyof Client>(k: K): Client[K] | undefined =>
    (draft[k] as Client[K]) ?? (client ? client[k] : undefined);

  const setTab = (id: TabId) => {
    const next = new URLSearchParams(params);
    next.set("tab", id);
    setParams(next, { replace: true });
  };

  const save = useMutation({
    mutationFn: () => api.updateClient(clientId, draft),
    onSuccess: () => {
      setDraft({});
      qc.invalidateQueries({ queryKey: ["client", clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });

  const checkout = useMutation({
    mutationFn: () => api.billingCheckout(clientId),
    onSuccess: (r: { url: string; stub: boolean }) => window.open(r.url, "_blank"),
  });

  const sendInvoice = useMutation({
    mutationFn: () => api.sendClientInvoice(clientId),
  });

  const impersonate = useMutation({
    mutationFn: async () => {
      // Open synchronously on click so mobile/desktop popup blockers don't kill the tab.
      const tab = window.open("about:blank", "_blank");
      try {
        const r = await api.impersonateClient(clientId);
        if (tab) tab.location.href = r.url;
        else window.location.href = r.url;
        return r;
      } catch (err) {
        tab?.close();
        throw err;
      }
    },
  });

  const rebuildSite = useMutation({
    mutationFn: () => api.rebuildClientSite(clientId),
    onSuccess: (r: { previewUrl: string }) => {
      qc.invalidateQueries({ queryKey: ["client", clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      window.open(r.previewUrl, "_blank");
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteClient(clientId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      navigate("/admin/clients");
    },
  });

  const assetsQ = useQuery({
    queryKey: ["client-assets", clientId],
    queryFn: () => api.listClientAssets(clientId),
    enabled: !!clientId && tab === "assets",
  });

  const quotesQ = useQuery({
    queryKey: ["client-quotes", clientId],
    queryFn: () => api.listClientQuotes(clientId),
    enabled: !!clientId && tab === "quotes",
  });

  const uploadAsset = useMutation({
    mutationFn: (body: {
      kind: ClientAssetKind;
      contentType: string;
      dataBase64: string;
      caption?: string;
      filename?: string;
    }) => api.uploadClientAsset(clientId, body),
    onSuccess: () => {
      setAssetNotice("Uploaded.");
      setUploadCaption("");
      qc.invalidateQueries({ queryKey: ["client-assets", clientId] });
    },
  });

  const patchAsset = useMutation({
    mutationFn: (args: { assetId: string; kind?: ClientAssetKind; caption?: string | null }) =>
      api.updateClientAsset(clientId, args.assetId, { kind: args.kind, caption: args.caption }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-assets", clientId] }),
  });

  const deleteAsset = useMutation({
    mutationFn: (assetId: string) => api.deleteClientAsset(clientId, assetId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-assets", clientId] }),
  });

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setAssetNotice("");
    for (const file of Array.from(files)) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Read failed"));
        reader.readAsDataURL(file);
      });
      await uploadAsset.mutateAsync({
        kind: uploadKind,
        contentType: file.type || "image/jpeg",
        dataBase64: dataUrl,
        caption: uploadCaption || undefined,
        filename: file.name,
      });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const base = health?.publicBaseUrl || "";
  const embed = client ? `<script src="${base}/widget.js" data-key="${client.routeKey}" defer></script>` : "";
  const siteUrl = client?.sitePreviewUrl || (client?.siteSlug ? `/sites/${client.siteSlug}/` : null);

  const assetsByKind = useMemo(() => {
    const map: Record<ClientAssetKind, ClientAsset[]> = { LOGO: [], SHOWCASE: [], JOB: [], OTHER: [] };
    for (const a of assetsQ.data || []) {
      const kind = (CLIENT_ASSET_KINDS.includes(a.kind) ? a.kind : "OTHER") as ClientAssetKind;
      map[kind].push(a);
    }
    return map;
  }, [assetsQ.data]);

  if (isLoading) {
    return (
      <div className="page">
        <p>Loading client…</p>
      </div>
    );
  }

  if (isError || !client) {
    return (
      <div className="page">
        <p className="error">{(error as Error)?.message || "Client not found"}</p>
        <Link to="/admin/clients">← Back to clients</Link>
      </div>
    );
  }

  return (
    <div className="page client-detail">
      <div className="client-detail-top">
        <div>
          <Link to="/admin/clients" className="back-link">
            ← Clients
          </Link>
          <h1>{client.businessName}</h1>
          <p className="sub">
            {client.tradeTitle || "Trade"} · {client.town || "—"} · <code>{client.routeKey}</code>
          </p>
          <div className="drawer-badges">
            <span className={`badge ${client.status === "ACTIVE" ? "green" : client.status === "PAST_DUE" ? "amber" : "red"}`}>
              {client.status}
            </span>
            <span className="score warm">{client.leads30 ?? 0} leads / 30d</span>
            {client.heldTotal ? <span className="badge amber">{client.heldTotal} held</span> : null}
          </div>
        </div>
        <div className="head-actions">
          <button
            type="button"
            className="buttonish"
            onClick={() => impersonate.mutate()}
            disabled={impersonate.isPending}
            title="Open the tradie app signed in as this client"
          >
            {impersonate.isPending ? "Opening…" : "Tradie login ↗"}
          </button>
          {impersonate.isError && (
            <p className="error" style={{ margin: "8px 0 0" }}>
              {(impersonate.error as Error).message}
            </p>
          )}
        </div>
      </div>

      <label className="mobile-tab-select">
        Section
        <select value={tab} onChange={(e) => setTab(e.target.value as TabId)} aria-label="Client section">
          {TABS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <nav className="client-tabs client-tabs--desktop" aria-label="Client sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "client-tab active" : "client-tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="client-tab-panel card">
        {tab === "account" && (
          <section className="client-section">
            <h2>Account info</h2>
            <p className="muted-text">Routing, status, and business details for this tradie.</p>
            <div className="form-grid">
              <label>
                Business name
                <input
                  value={value("businessName") ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, businessName: e.target.value }))}
                />
              </label>
              <label>
                Trade
                <input
                  value={value("tradeTitle") ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, tradeTitle: e.target.value }))}
                />
              </label>
              <label>
                Town
                <input value={value("town") ?? ""} onChange={(e) => setDraft((d) => ({ ...d, town: e.target.value }))} />
              </label>
              <label>
                Business postcode
                <input
                  placeholder="e.g. SW1A 1AA"
                  value={value("postcode") ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, postcode: e.target.value }))}
                />
              </label>
              <label>
                Destination phone
                <input
                  value={value("destPhone") ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, destPhone: e.target.value }))}
                />
              </label>
              <label>
                Channel
                <select
                  value={value("destChannel") as Channel}
                  onChange={(e) => setDraft((d) => ({ ...d, destChannel: e.target.value as Channel }))}
                >
                  {CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  value={value("status") as ClientStatus}
                  onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as ClientStatus }))}
                >
                  {CLIENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="muted-text">PAST_DUE / SUSPENDED holds new leads (stored, not delivered).</p>
            <div className="drawer-actions row-actions">
              <button
                className="primary"
                onClick={() => save.mutate()}
                disabled={save.isPending || Object.keys(draft).length === 0}
              >
                {save.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
            {save.isError && <p className="error">{(save.error as Error).message}</p>}

            <h3 className="danger-title">Danger zone</h3>
            <button
              className="danger"
              onClick={() => {
                if (window.confirm(`Delete ${client.businessName}? This removes enquiry history too.`)) {
                  remove.mutate();
                }
              }}
              disabled={remove.isPending}
            >
              {remove.isPending ? "Deleting…" : "Delete client"}
            </button>
            {remove.isError && <p className="error">{(remove.error as Error).message}</p>}
          </section>
        )}

        {tab === "billing" && (
          <section className="client-section">
            <h2>Billing</h2>
            <p className="muted-text">Stripe checkout / invoice link for this tradie’s subscription.</p>
            <dl className="kv">
              <dt>Stripe customer</dt>
              <dd>
                <code>{client.stripeCustomerId || "—"}</code>
              </dd>
              <dt>Subscription</dt>
              <dd>
                <code>{client.stripeSubId || "—"}</code>
              </dd>
              <dt>Status</dt>
              <dd>{client.status}</dd>
            </dl>
            <div className="drawer-actions row-actions">
              <button className="primary" onClick={() => sendInvoice.mutate()} disabled={sendInvoice.isPending}>
                {sendInvoice.isPending ? "Sending…" : "Send invoice SMS"}
              </button>
              <button className="build" onClick={() => checkout.mutate()} disabled={checkout.isPending}>
                {checkout.isPending ? "Opening…" : "Start / manage billing"}
              </button>
            </div>
            {checkout.data?.stub && <p className="muted-text">Stripe not configured — opened a stub checkout URL.</p>}
            {sendInvoice.data && (
              <p className="muted-text">
                {sendInvoice.data.delivered
                  ? "Billing link texted to the tradie."
                  : sendInvoice.data.stub
                    ? "Stripe not configured — stub link generated (not SMS-delivered)."
                    : "Billing link created, but delivery could not be confirmed."}
              </p>
            )}
            {sendInvoice.isError && <p className="error">{(sendInvoice.error as Error).message}</p>}
          </section>
        )}

        {tab === "leads" && (
          <section className="client-section">
            <h2>Leads / enquiries</h2>
            <p className="muted-text">
              {client.leads30 ?? 0} in the last 30 days · {client.enquiries?.length ?? 0} recent shown
            </p>
            {(!client.enquiries || client.enquiries.length === 0) && <p className="muted-text">No enquiries yet.</p>}
            <div className="enquiry-list">
              {client.enquiries?.map((e: Enquiry) => (
                <div key={e.id} className="enquiry">
                  <div className="enquiry-top">
                    <strong>{e.name}</strong>
                    <span className={ENQUIRY_STATUS[e.status] || "badge grey"}>{e.status}</span>
                  </div>
                  <div className="muted-text">
                    {e.phone} · {new Date(e.createdAt).toLocaleString()} · via {e.source}
                    {e.postcode ? ` · ${e.postcode}${e.distanceMiles != null ? ` (~${e.distanceMiles} mi)` : ""}` : ""}
                  </div>
                  {e.message && <p>{e.message}</p>}
                  {e.photoUrls?.length ? (
                    <div className="enquiry-photos">
                      {e.photoUrls.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt="Problem photo" />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "quotes" && (
          <section className="client-section">
            <h2>Quotes</h2>
            <p className="muted-text">Draft and sent quotes from the tradie inbox.</p>
            {quotesQ.isLoading && <p>Loading…</p>}
            {quotesQ.isError && <p className="error">{(quotesQ.error as Error).message}</p>}
            {(quotesQ.data || []).length === 0 && !quotesQ.isLoading && (
              <p className="muted-text">No quotes yet.</p>
            )}
            <div className="quote-list">
              {(quotesQ.data as {
                id: string;
                status: string;
                totalPence: number;
                createdAt: string;
                publicToken: string;
                enquiry?: { name: string; phone: string } | null;
              }[] || []).map((q) => (
                <div key={q.id} className="enquiry">
                  <div className="enquiry-top">
                    <strong>{q.enquiry?.name || "Quote"}</strong>
                    <span className={QUOTE_STATUS[q.status] || "badge grey"}>{q.status}</span>
                  </div>
                  <div className="muted-text">
                    {formatGbp(q.totalPence)} · {new Date(q.createdAt).toLocaleString()}
                    {q.enquiry?.phone ? ` · ${q.enquiry.phone}` : ""}
                  </div>
                  {q.status !== "DRAFT" && (
                    <a href={`/q/${q.publicToken}`} target="_blank" rel="noreferrer">
                      Customer link ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "pricebook" && (
          <section className="client-section">
            <PriceBookEditor
              title="Price book"
              queryKey={["client-price-book", clientId]}
              api={{
                list: () => api.listClientPriceBook(clientId),
                save: (items) => api.saveClientPriceBook(clientId, items),
                importRows: (rows) => api.importClientPriceBook(clientId, rows),
                deactivate: (itemId) => api.deactivateClientPriceBookItem(clientId, itemId),
              }}
            />
          </section>
        )}

        {tab === "messages" && (
          <section className="client-section">
            <h2>Messages</h2>
            <p className="muted-text">SMS / WhatsApp templates for lead routing and customer acknowledgement.</p>
            <label className="notes-label">
              Tradie notification
              <textarea
                rows={4}
                placeholder="Default used if blank. Placeholders: {{name}} {{phone}} {{message}} {{postcode}}"
                value={value("tradieNotifyTpl") ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, tradieNotifyTpl: e.target.value }))}
              />
            </label>
            <label className="notes-label">
              Customer auto-reply
              <textarea
                rows={3}
                placeholder="Default used if blank. Placeholders: {{name}} {{business}}"
                value={value("customerAckTpl") ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, customerAckTpl: e.target.value }))}
              />
            </label>
            <div className="drawer-actions row-actions">
              <button
                className="primary"
                onClick={() => save.mutate()}
                disabled={save.isPending || Object.keys(draft).length === 0}
              >
                {save.isPending ? "Saving…" : "Save templates"}
              </button>
            </div>
            {save.isError && <p className="error">{(save.error as Error).message}</p>}

            <h3 style={{ marginTop: 24 }}>Tradie inbox</h3>
            <p className="muted-text">Opens the tradie app signed in as this client (one-time magic link).</p>
            <div className="site-links">
              <button
                type="button"
                className="link"
                onClick={() => impersonate.mutate()}
                disabled={impersonate.isPending}
              >
                {impersonate.isPending ? "Opening…" : "Open as this tradie ↗"}
              </button>
            </div>
            {impersonate.isError && <p className="error">{(impersonate.error as Error).message}</p>}
            <p className="muted-text">
              Route key: <code>{client.routeKey}</code>
            </p>
          </section>
        )}

        {tab === "website" && (
          <section className="client-section">
            <h2>Website & embed</h2>
            <p className="muted-text">Demo site and widget snippet for this client’s route key.</p>
            {siteUrl ? (
              <>
                <div className="site-links">
                  <a href={siteUrl} target="_blank" rel="noreferrer">
                    View demo site ↗
                  </a>
                </div>
                {client.leadId && (
                  <button className="build" onClick={() => rebuildSite.mutate()} disabled={rebuildSite.isPending}>
                    {rebuildSite.isPending ? "Rebuilding…" : "Rebuild demo site"}
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="muted-text">No demo site yet.</p>
                {client.leadId ? (
                  <button className="build" onClick={() => rebuildSite.mutate()} disabled={rebuildSite.isPending}>
                    {rebuildSite.isPending ? "Building…" : "Build demo site"}
                  </button>
                ) : (
                  <p className="muted-text">Not linked to a lead — can’t generate a demo site from CRM alone.</p>
                )}
              </>
            )}
            {rebuildSite.isError && <p className="error">{(rebuildSite.error as Error).message}</p>}

            <h3 style={{ marginTop: 24 }}>Embed on an existing site</h3>
            <p className="muted-text">Paste this one line into any website to add lead capture:</p>
            <pre className="embed-code">{embed}</pre>
          </section>
        )}

        {tab === "assets" && (
          <section className="client-section">
            <h2>Assets</h2>
            <p className="muted-text">
              Company logo, showcase / portfolio photos, and job pictures for website generation and quotes.
            </p>

            <div className="asset-upload card filters">
              <div className="filter-row">
                <label>
                  Type
                  <select value={uploadKind} onChange={(e) => setUploadKind(e.target.value as ClientAssetKind)}>
                    {CLIENT_ASSET_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Caption (optional)
                  <input value={uploadCaption} onChange={(e) => setUploadCaption(e.target.value)} placeholder="Kitchen install…" />
                </label>
              </div>
              <div className="drawer-actions row-actions">
                <button type="button" className="primary" onClick={() => fileRef.current?.click()} disabled={uploadAsset.isPending}>
                  {uploadAsset.isPending ? "Uploading…" : "Upload images"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  hidden
                  onChange={(e) => void onPickFiles(e.target.files)}
                />
              </div>
              {assetNotice && <p className="muted-text">{assetNotice}</p>}
              {uploadAsset.isError && <p className="error">{(uploadAsset.error as Error).message}</p>}
            </div>

            {assetsQ.isLoading && <p>Loading…</p>}
            {assetsQ.isError && <p className="error">{(assetsQ.error as Error).message}</p>}

            {CLIENT_ASSET_KINDS.map((kind) => (
              <div key={kind} className="asset-kind-block">
                <h3>{kind}</h3>
                {assetsByKind[kind].length === 0 ? (
                  <p className="muted-text">None yet.</p>
                ) : (
                  <div className="asset-grid">
                    {assetsByKind[kind].map((a) => (
                      <figure key={a.id} className="asset-card">
                        <a href={a.url} target="_blank" rel="noreferrer">
                          <img src={a.url} alt={a.caption || a.filename || kind} />
                        </a>
                        <figcaption>
                          <input
                            defaultValue={a.caption || ""}
                            placeholder="Caption"
                            onBlur={(e) => {
                              const next = e.target.value.trim();
                              if (next !== (a.caption || "")) {
                                patchAsset.mutate({ assetId: a.id, caption: next || null });
                              }
                            }}
                          />
                          <select
                            value={a.kind}
                            onChange={(e) =>
                              patchAsset.mutate({ assetId: a.id, kind: e.target.value as ClientAssetKind })
                            }
                          >
                            {CLIENT_ASSET_KINDS.map((k) => (
                              <option key={k} value={k}>
                                {k}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="linkish"
                            onClick={() => {
                              if (confirm("Delete this asset?")) deleteAsset.mutate(a.id);
                            }}
                          >
                            Delete
                          </button>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
