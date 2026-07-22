import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { OutreachStatus } from "../types";
import { OUTREACH_STATUSES } from "../types";
import { formatLastFetched, parseOpeningHours } from "../lib/leadFields";
import { WebsiteClassBadge, ScorePill, DomainBadge } from "../components/Badges";
import ProgressOverlay from "../components/ProgressOverlay";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "google", label: "Google" },
  { id: "outreach", label: "Outreach" },
  { id: "website", label: "Website" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function isTab(v: string | null): v is TabId {
  return TABS.some((t) => t.id === v);
}

export default function LeadDetailPage() {
  const { leadId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab: TabId = isTab(params.get("tab")) ? (params.get("tab") as TabId) : "overview";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: lead, isLoading, isError, error } = useQuery({
    queryKey: ["lead", leadId],
    queryFn: () => api.getLead(leadId),
    enabled: !!leadId,
  });

  const [notes, setNotes] = useState("");
  const [email, setEmail] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState("");
  const [refreshPercent, setRefreshPercent] = useState(0);

  useEffect(() => {
    if (!lead) return;
    setNotes(lead.notes ?? "");
    setEmail(lead.email ?? "");
  }, [lead]);

  const setTab = (id: TabId) => {
    const next = new URLSearchParams(params);
    next.set("tab", id);
    setParams(next, { replace: true });
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["lead", leadId] });
    qc.invalidateQueries({ queryKey: ["leads"] });
  };

  const save = useMutation({
    mutationFn: () => api.updateLead(leadId, { notes, email: email.trim() || "" }),
    onSuccess: invalidate,
  });

  const markScreened = useMutation({
    mutationFn: () =>
      api.updateLead(leadId, { tpsCheckedAt: new Date().toISOString(), outreachStatus: "SCREENED" }),
    onSuccess: invalidate,
  });

  const statusMutation = useMutation({
    mutationFn: (status: OutreachStatus) => api.updateLead(leadId, { outreachStatus: status }),
    onSuccess: invalidate,
  });

  const generate = useMutation({
    mutationFn: () => api.generateSite(leadId),
    onSuccess: (res: { previewUrl: string }) => {
      invalidate();
      window.open(res.previewUrl, "_blank");
    },
  });

  const convert = useMutation({
    mutationFn: () => api.convertLead(leadId),
    onSuccess: (result: { id: string }) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["clients"] });
      navigate(`/admin/clients/${result.id}`);
    },
  });

  const deleteLead = useMutation({
    mutationFn: () => api.deleteLead(leadId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      navigate("/admin/leads");
    },
  });

  const confirmDelete = () => {
    if (
      window.confirm(
        `Delete ${lead?.displayName ?? "this lead"}? Converted clients are kept; only the lead row is removed.`
      )
    ) {
      deleteLead.mutate();
    }
  };

  const refreshFromGoogle = async () => {
    if (!lead) return;
    setRefreshing(true);
    setRefreshMessage(`Fetching ${lead.displayName} from Google…`);
    setRefreshPercent(10);
    try {
      await api.refreshLead(leadId);
      setRefreshPercent(100);
      setRefreshMessage("Lead updated from Google");
      invalidate();
    } catch (err) {
      setRefreshMessage(err instanceof Error ? err.message : "Refresh failed");
      setRefreshPercent(0);
    } finally {
      window.setTimeout(() => setRefreshing(false), 500);
    }
  };

  if (isLoading) {
    return (
      <div className="page">
        <p>Loading lead…</p>
      </div>
    );
  }

  if (isError || !lead) {
    return (
      <div className="page">
        <p className="error">{(error as Error)?.message || "Lead not found"}</p>
        <Link to="/admin/leads">← Back to leads</Link>
      </div>
    );
  }

  const hours = parseOpeningHours(lead.openingHours);
  const reviews = lead.googleReviews ?? [];

  return (
    <div className="page client-detail">
      <ProgressOverlay
        visible={refreshing}
        title="Refreshing from Google"
        message={refreshMessage}
        percent={refreshPercent}
      />

      <div className="client-detail-top">
        <div>
          <Link to="/admin/leads" className="back-link">
            ← Leads
          </Link>
          <h1>{lead.displayName}</h1>
          <p className="sub">
            {lead.occupation || "Trade"} · {lead.town || "—"} · {formatLastFetched(lead.lastFetchedAt)}
          </p>
          <div className="drawer-badges">
            <WebsiteClassBadge value={lead.websiteClass} />
            <ScorePill value={lead.priorityScore} />
            <DomainBadge value={lead.domainAvailable} suggested={lead.domainSuggested} />
          </div>
        </div>
        <div className="head-actions">
          <button onClick={() => refreshFromGoogle()} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh from Google"}
          </button>
          <button className="convert" onClick={() => convert.mutate()} disabled={convert.isPending || !lead.phone}>
            {convert.isPending ? "Converting…" : "Convert to client"}
          </button>
          <button className="danger" onClick={confirmDelete} disabled={deleteLead.isPending}>
            {deleteLead.isPending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      {convert.isError && <p className="error">{(convert.error as Error).message}</p>}
      {deleteLead.isError && <p className="error">{(deleteLead.error as Error).message}</p>}

      <nav className="client-tabs" aria-label="Lead sections">
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
        {tab === "overview" && (
          <section className="client-section">
            <h2>Overview</h2>
            <p className="muted-text">Contact details and qualification summary for this lead.</p>
            <dl className="kv">
              <dt>Occupation</dt>
              <dd>{lead.occupation || "—"}</dd>
              <dt>Address</dt>
              <dd>{lead.formattedAddress ?? "—"}</dd>
              <dt>Phone</dt>
              <dd>
                {lead.phone ?? "—"} {lead.phoneIsMobile && <span className="tag">mobile</span>}
              </dd>
              <dt>Email</dt>
              <dd>{lead.email ?? "—"}</dd>
              <dt>Rating</dt>
              <dd>
                {lead.rating?.toFixed(1) ?? "—"} ({lead.userRatingCount} reviews on Google)
              </dd>
              <dt>Outreach status</dt>
              <dd>
                <select
                  value={lead.outreachStatus}
                  onChange={(e) => statusMutation.mutate(e.target.value as OutreachStatus)}
                  disabled={statusMutation.isPending}
                >
                  {OUTREACH_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </dd>
              <dt>TPS/CTPS checked</dt>
              <dd>{lead.tpsCheckedAt ? new Date(lead.tpsCheckedAt).toLocaleDateString() : "not yet"}</dd>
              <dt>Google Business Profile</dt>
              <dd>
                {lead.googleMapsUri ? (
                  <>
                    Listed on Google Maps
                    {" · "}
                    <a href={lead.googleMapsUri} target="_blank" rel="noreferrer">
                      View profile
                    </a>
                  </>
                ) : (
                  "Not found"
                )}
              </dd>
            </dl>
          </section>
        )}

        {tab === "google" && (
          <section className="client-section">
            <h2>From Google</h2>
            <p className="muted-text">Use Refresh from Google to pull the latest profile data.</p>
            <dl className="kv">
              <dt>Category</dt>
              <dd>{lead.primaryType?.replace(/_/g, " ") ?? "—"}</dd>
              <dt>Summary</dt>
              <dd>{lead.editorialSummary ?? "—"}</dd>
              <dt>Opening hours</dt>
              <dd className="hours-list">
                {hours.length ? hours.map((line) => <div key={line}>{line}</div>) : "—"}
              </dd>
              <dt>Google reviews</dt>
              <dd className="review-snips">
                {reviews.length ? (
                  reviews.map((r: { author: string; text: string; rating: number }, i: number) => (
                    <blockquote key={`${r.author}-${i}`}>
                      <strong>{r.author}</strong> ({r.rating}/5): {r.text.slice(0, 220)}
                      {r.text.length > 220 ? "…" : ""}
                    </blockquote>
                  ))
                ) : (
                  "—"
                )}
              </dd>
            </dl>
          </section>
        )}

        {tab === "outreach" && (
          <section className="client-section">
            <h2>Outreach</h2>
            <p className="muted-text">Notes, email capture, and TPS screening for this lead.</p>
            <div className="form-grid">
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Add manually or scrape from their site"
                />
              </label>
              <label className="span-2">
                Notes
                <textarea rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </div>
            <div className="drawer-actions" style={{ marginTop: 16 }}>
              <button className="primary" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save notes & email"}
              </button>
              <button onClick={() => markScreened.mutate()} disabled={markScreened.isPending}>
                {markScreened.isPending ? "Updating…" : "Mark TPS-screened today"}
              </button>
            </div>
            {save.isError && <p className="error">{(save.error as Error).message}</p>}
          </section>
        )}

        {tab === "website" && (
          <section className="client-section">
            <h2>{lead.websiteClass === "PROPER" ? "Web presence & convert" : "Website & domain"}</h2>
            <p className="muted-text">
              {lead.websiteClass === "PROPER"
                ? "Strong beta candidate — they already have a site. Convert or invite them to trial TradiesMate."
                : "Demo site and suggested .co.uk for this lead (site-build pitch)."}
            </p>
            <dl className="kv">
              <dt>Existing website</dt>
              <dd>
                {lead.websiteUri ? (
                  <a href={lead.websiteUri} target="_blank" rel="noreferrer">
                    {lead.websiteUri}
                  </a>
                ) : (
                  "none"
                )}{" "}
                <span className="muted-text">({lead.websiteCheck})</span>
              </dd>
              {lead.websiteClass !== "PROPER" && (
                <>
                  <dt>Suggested domain</dt>
                  <dd>{lead.domainSuggested ?? "—"}</dd>
                  <dt>Demo site</dt>
                  <dd>
                    {lead.siteSlug ? (
                      <div className="site-links">
                        <a href={`/sites/${lead.siteSlug}/`} target="_blank" rel="noreferrer">
                          View site ↗
                        </a>
                        <a href={api.downloadSiteUrl(lead.id)}>Download HTML</a>
                        {lead.siteGeneratedAt && (
                          <span className="muted-text">
                            Built {new Date(lead.siteGeneratedAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    ) : (
                      "Not built yet"
                    )}
                  </dd>
                </>
              )}
            </dl>
            <div className="drawer-actions" style={{ marginTop: 16 }}>
              {lead.websiteClass !== "PROPER" && (
                <button className="build" onClick={() => generate.mutate()} disabled={generate.isPending || !lead.phone}>
                  {generate.isPending ? "Building…" : lead.siteGeneratedAt ? "Rebuild demo site" : "Build demo site"}
                </button>
              )}
              <button className="convert" onClick={() => convert.mutate()} disabled={convert.isPending || !lead.phone}>
                {convert.isPending ? "Converting…" : "Convert to client"}
              </button>
            </div>
            {!lead.phone && (
              <p className="muted-text">Add a phone number (via Google refresh) before building or converting.</p>
            )}
            {generate.isError && <p className="error">{(generate.error as Error).message}</p>}
          </section>
        )}
      </div>
    </div>
  );
}
