import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Lead } from "../types";
import { api } from "../api/client";
import { formatLastFetched, parseOpeningHours } from "../lib/leadFields";
import { WebsiteClassBadge, ScorePill, DomainBadge } from "./Badges";
import ProgressOverlay from "./ProgressOverlay";

export default function LeadDrawer({
  lead,
  onClose,
  onLeadUpdated,
}: {
  lead: Lead;
  onClose: () => void;
  onLeadUpdated?: () => void;
}) {
  const [current, setCurrent] = useState(lead);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState("");
  const [refreshPercent, setRefreshPercent] = useState(0);

  useEffect(() => {
    setCurrent(lead);
    setNotes(lead.notes ?? "");
    setEmail(lead.email ?? "");
  }, [lead]);

  const convert = useMutation({
    mutationFn: () => api.convertLead(current.id),
    onSuccess: (result: Awaited<ReturnType<typeof api.convertLead>>) => {
      onLeadUpdated?.();
      const parts = [
        `Client created for ${result.businessName}.`,
        `Route key: ${result.routeKey}.`,
        result.siteRegenerated
          ? "Demo site updated — the contact form now routes enquiries via Twilio."
          : current.siteSlug
            ? "Rebuild the demo site to wire the contact form."
            : "Build a demo site or use the embed code in Clients.",
        "Open the Clients tab to manage SMS routing and billing.",
      ];
      alert(parts.join(" "));
    },
  });

  const save = useMutation({
    mutationFn: () => api.updateLead(current.id, { notes, email: email.trim() || "" }),
    onSuccess: (updated: Lead) => {
      setCurrent(updated);
      onLeadUpdated?.();
    },
  });

  const markScreened = useMutation({
    mutationFn: () =>
      api.updateLead(current.id, { tpsCheckedAt: new Date().toISOString(), outreachStatus: "SCREENED" }),
    onSuccess: (updated: Lead) => {
      setCurrent(updated);
      onLeadUpdated?.();
    },
  });

  const refreshFromGoogle = async () => {
    setRefreshing(true);
    setRefreshMessage(`Fetching ${current.displayName} from Google…`);
    setRefreshPercent(10);
    try {
      const updated = await api.refreshLead(current.id);
      setCurrent(updated);
      setEmail(updated.email ?? "");
      setRefreshPercent(100);
      setRefreshMessage("Lead updated from Google");
      onLeadUpdated?.();
    } catch (err) {
      setRefreshMessage(err instanceof Error ? err.message : "Refresh failed");
      setRefreshPercent(0);
    } finally {
      window.setTimeout(() => setRefreshing(false), 500);
    }
  };

  const generate = useMutation({
    mutationFn: () => api.generateSite(current.id),
    onSuccess: (res: { slug: string; previewUrl: string }) => {
      onLeadUpdated?.();
      window.open(res.previewUrl, "_blank");
    },
  });

  const hours = parseOpeningHours(current.openingHours);
  const reviews = current.googleReviews ?? [];

  return (
    <>
      <ProgressOverlay
        visible={refreshing}
        title="Refreshing from Google"
        message={refreshMessage}
        percent={refreshPercent}
      />
      <div className="drawer-backdrop" onClick={onClose}>
        <aside className="drawer" onClick={(e) => e.stopPropagation()}>
          <button className="close" onClick={onClose}>
            ×
          </button>
          <h2>{current.displayName}</h2>
          <div className="drawer-badges">
            <WebsiteClassBadge value={current.websiteClass} />
            <ScorePill value={current.priorityScore} />
            <DomainBadge value={current.domainAvailable} suggested={current.domainSuggested} />
          </div>
          <p className="drawer-sync-note">{formatLastFetched(current.lastFetchedAt)}</p>

          <dl>
            <dt>Occupation</dt>
            <dd>{current.occupation}</dd>
            <dt>Address</dt>
            <dd>{current.formattedAddress ?? "—"}</dd>
            <dt>Phone</dt>
            <dd>
              {current.phone ?? "—"} {current.phoneIsMobile && <span className="tag">mobile</span>}
            </dd>
            <dt>Email</dt>
            <dd>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Add manually or scrape from their site"
              />
            </dd>
            <dt>Google Business Profile</dt>
            <dd>
              {current.googleMapsUri ? (
                <>
                  Listed on Google Maps
                  {" · "}
                  <a href={current.googleMapsUri} target="_blank" rel="noreferrer">
                    View profile
                  </a>
                </>
              ) : (
                "Not found"
              )}
            </dd>
          </dl>

          <section className="drawer-section">
            <h3>From Google</h3>
            <p className="drawer-section-hint">Use Refresh from Google to pull the latest profile data.</p>
            <dl>
              <dt>Category</dt>
              <dd>{current.primaryType?.replace(/_/g, " ") ?? "—"}</dd>
              <dt>Summary</dt>
              <dd>{current.editorialSummary ?? "—"}</dd>
              <dt>Opening hours</dt>
              <dd className="hours-list">
                {hours.length ? hours.map((line) => <div key={line}>{line}</div>) : "—"}
              </dd>
              <dt>Google reviews</dt>
              <dd className="review-snips">
                {reviews.length ? (
                  reviews.map((r, i) => (
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

          <dl>
            <dt>Rating</dt>
            <dd>
              {current.rating?.toFixed(1) ?? "—"} ({current.userRatingCount} reviews on Google)
            </dd>
            <dt>Existing website</dt>
            <dd>
              {current.websiteUri ? (
                <a href={current.websiteUri} target="_blank" rel="noreferrer">
                  {current.websiteUri}
                </a>
              ) : (
                "none"
              )}{" "}
              <span className="muted-text">({current.websiteCheck})</span>
            </dd>
            <dt>Suggested domain</dt>
            <dd>{current.domainSuggested ?? "—"}</dd>
            <dt>TPS/CTPS checked</dt>
            <dd>{current.tpsCheckedAt ? new Date(current.tpsCheckedAt).toLocaleDateString() : "not yet"}</dd>
          </dl>

          <label className="notes-label">
            Notes
            <textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <div className="drawer-actions">
            <button className="primary" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save notes & email"}
            </button>
            <button className="build" onClick={() => generate.mutate()} disabled={generate.isPending || !current.phone}>
              {generate.isPending ? "Building…" : current.siteGeneratedAt ? "Rebuild demo site" : "Build demo site"}
            </button>
            {current.siteSlug && (
              <div className="site-links">
                <a href={`/sites/${current.siteSlug}/`} target="_blank" rel="noreferrer">
                  View site ↗
                </a>
                <a href={api.downloadSiteUrl(current.id)}>Download HTML</a>
              </div>
            )}
            <button className="convert" onClick={() => convert.mutate()} disabled={convert.isPending || !current.phone}>
              {convert.isPending ? "Converting…" : "Convert to client"}
            </button>
            <button onClick={() => markScreened.mutate()} disabled={markScreened.isPending}>
              Mark TPS-screened today
            </button>
            <button onClick={() => refreshFromGoogle()} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh from Google"}
            </button>
          </div>
          {generate.isError && <p className="error">{(generate.error as Error).message}</p>}
          {convert.isError && <p className="error">{(convert.error as Error).message}</p>}
        </aside>
      </div>
    </>
  );
}
