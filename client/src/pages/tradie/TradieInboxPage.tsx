import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tradieApi } from "../../api/tradie";
import {
  EmptyState,
  QueryError,
  IconBookWork,
  IconChevron,
  IconPhone,
  IconQuoteFirst,
  IconSiteVisit,
} from "./ui";

type InboxItem = {
  id: string;
  name: string;
  phone: string;
  message: string | null;
  postcode: string | null;
  distanceMiles: number | null;
  source: string;
  triage: "LIKELY_JOB" | "QUOTE_SHOPPER" | "SPAM" | "UNKNOWN";
  summary: string | null;
  conversationSnippet: string | null;
  createdAt: string;
};

function triageLabel(t: InboxItem["triage"]): string {
  switch (t) {
    case "LIKELY_JOB":
      return "Likely job";
    case "QUOTE_SHOPPER":
      return "Quote shopper";
    case "SPAM":
      return "Spam";
    default:
      return "Needs a look";
  }
}

function triagePill(t: InboxItem["triage"]): string {
  switch (t) {
    case "LIKELY_JOB":
      return "t-pill t-pill--green";
    case "QUOTE_SHOPPER":
      return "t-pill t-pill--amber";
    case "SPAM":
      return "t-pill t-pill--red";
    default:
      return "t-pill t-pill--orange";
  }
}

type PathId = "visit" | "quote" | "book";

/**
 * The three ways a lead becomes work, in the order a tradie decides between
 * them: go and look, price it, or just book it in.
 */
const PATHS: { id: PathId; label: string; hint: string; Icon: (p: { size?: number }) => JSX.Element }[] = [
  {
    id: "visit",
    label: "Site visit first",
    hint: "Inspect first, then decide scope or price.",
    Icon: IconSiteVisit,
  },
  {
    id: "quote",
    label: "Quote first",
    hint: "Customer wants a price before proceeding.",
    Icon: IconQuoteFirst,
  },
  {
    id: "book",
    label: "Book the job",
    hint: "Work already authorised — no quote needed.",
    Icon: IconBookWork,
  },
];

function whenLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TradieInboxPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sheetFor, setSheetFor] = useState<InboxItem | null>(null);

  const inbox = useQuery({
    queryKey: ["tradie-inbox"],
    queryFn: () => tradieApi.inbox(),
  });

  /**
   * Promote the lead, then land on whatever that path actually needs next.
   *
   * All three create the same job — the difference is only where the tradie is
   * dropped, because "quote first" and "book it in" want different screens and
   * making them find the right tab afterwards is how a two-tap decision becomes
   * a five-tap one. A site visit is booked as a Survey with no price committed.
   */
  const promote = useMutation({
    mutationFn: (opts: { id: string; path: PathId }) => tradieApi.promoteJob(opts.id),
    onSuccess: (_r: { id: string }, opts) => {
      setSheetFor(null);
      void qc.invalidateQueries({ queryKey: ["tradie-inbox"] });
      void qc.invalidateQueries({ queryKey: ["tradie-jobs"] });
      const state = { from: "/t/inbox", fromLabel: "Inbox" };
      if (opts.path === "quote") {
        navigate(`/t/jobs/${opts.id}?tab=quote`, { state });
        return;
      }
      navigate(`/t/jobs/${opts.id}/schedule${opts.path === "visit" ? "?kind=Survey" : ""}`, { state });
    },
  });

  const kill = useMutation({
    mutationFn: (opts: { id: string; reason: "dead" | "spam" }) => tradieApi.killJob(opts.id, opts.reason),
    onSuccess: () => {
      setSheetFor(null);
      void qc.invalidateQueries({ queryKey: ["tradie-inbox"] });
    },
  });

  const { needsYou, caught } = useMemo(() => {
    const items: InboxItem[] = inbox.data?.items || [];
    return {
      needsYou: items.filter((i: InboxItem) => i.triage !== "SPAM"),
      caught: items.filter((i: InboxItem) => i.triage === "SPAM"),
    };
  }, [inbox.data]);

  const busy = promote.isPending || kill.isPending;

  return (
    <div>
      <header className="t-page-head t-page-head--row">
        <div>
          <h2>Inbox</h2>
          <p>Missed calls and new leads — call back, make a job, or kill</p>
        </div>
        <div className="t-head-actions">
          <Link className="t-add-btn" to="/t/inbox/new" aria-label="Add enquiry">
            +
          </Link>
        </div>
      </header>

      {inbox.isLoading && <p className="muted-text">Loading inbox…</p>}
      <QueryError error={inbox.error} />

      {/* Require real data (even stale/cached), not just "no error yet" — otherwise a
          failed fetch with no cache reads as a reassuring "Inbox is clear". */}
      {inbox.data && needsYou.length === 0 && caught.length === 0 && (
        <>
          <EmptyState
            title="Inbox is clear"
            hint="When a call diverts, we’ll summarise it here with a spam or job guess."
          />
          <Link className="t-btn t-btn--block" to="/t/inbox/new" style={{ marginTop: 12 }}>
            Add a lead yourself
          </Link>
        </>
      )}

      {needsYou.length > 0 && (
        <section className="t-inbox-section">
          <p className="t-section-label">Needs you · {needsYou.length}</p>
          <ul className="t-list">
            {needsYou.map((item) => (
              <li key={item.id}>
                <button type="button" className="t-row t-row--btn" onClick={() => setSheetFor(item)}>
                  <div className="t-row-main">
                    <div className="t-row-top">
                      <strong>{item.name}</strong>
                      <span className={triagePill(item.triage)}>{triageLabel(item.triage)}</span>
                    </div>
                    <span className="t-row-sub">
                      {item.phone}
                      {item.postcode ? ` · ${item.postcode}` : ""}
                      {item.distanceMiles != null ? ` · ~${item.distanceMiles} mi` : ""}
                      {` · ${whenLabel(item.createdAt)}`}
                    </span>
                    {(item.summary || item.message) && (
                      <span className="t-row-snip">{item.summary || item.message}</span>
                    )}
                  </div>
                  <div className="t-row-side">
                    <IconChevron />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {caught.length > 0 && (
        <section className="t-inbox-section">
          <p className="t-section-label">Caught for you · {caught.length}</p>
          <p className="muted-text t-inbox-caught-note">
            Pre-tagged as spam / telesales. Open any to call back or kill for good.
          </p>
          <ul className="t-list">
            {caught.map((item) => (
              <li key={item.id}>
                <button type="button" className="t-row t-row--btn" onClick={() => setSheetFor(item)}>
                  <div className="t-row-main">
                    <div className="t-row-top">
                      <strong>{item.name}</strong>
                      <span className={triagePill(item.triage)}>Spam</span>
                    </div>
                    <span className="t-row-sub">
                      {item.phone} · {whenLabel(item.createdAt)}
                    </span>
                    {(item.summary || item.message) && (
                      <span className="t-row-snip">{item.summary || item.message}</span>
                    )}
                  </div>
                  <div className="t-row-side">
                    <IconChevron />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sheetFor && (
        <div className="t-more-root" role="presentation" onClick={() => !busy && setSheetFor(null)}>
          <div
            className="t-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Inbox actions"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="t-more-handle" aria-hidden="true" />
            <p className="t-more-title">{sheetFor.name}</p>
            <p className="muted-text" style={{ margin: "0 0 4px" }}>
              <span className={triagePill(sheetFor.triage)}>{triageLabel(sheetFor.triage)}</span>
              {" · "}
              {whenLabel(sheetFor.createdAt)}
            </p>
            <p className="muted-text" style={{ margin: "0 0 12px" }}>
              {sheetFor.summary || sheetFor.message || "No summary"}
            </p>
            {sheetFor.conversationSnippet && (
              <p className="t-inbox-snippet">{sheetFor.conversationSnippet}</p>
            )}
            {/*
              Ringing back comes first because it is what actually wins the job,
              and it's the one action that works whether or not the lead turns
              into anything. The three paths below it are the same three the PRD
              puts behind a "New work" chooser — they belong here, at the moment
              the tradie decides what this lead is, rather than on a screen of
              their own that has to ask who the customer is all over again.
            */}
            <div className="t-sheet-actions">
              <a className="primary t-btn--block t-sheet-call" href={`tel:${sheetFor.phone}`}>
                <IconPhone /> Call back
              </a>

              {PATHS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="t-path-card"
                  disabled={busy}
                  onClick={() => promote.mutate({ id: sheetFor.id, path: p.id })}
                >
                  <span className={`t-path-icon t-path-icon--${p.id}`} aria-hidden="true">
                    <p.Icon />
                  </span>
                  <span className="t-path-main">
                    <strong>{p.label}</strong>
                    <span className="muted-text">{p.hint}</span>
                  </span>
                  <IconChevron />
                </button>
              ))}

              <button
                type="button"
                className="danger t-btn--block"
                disabled={busy}
                onClick={() => kill.mutate({ id: sheetFor.id, reason: "spam" })}
              >
                Spam
              </button>
              <button
                type="button"
                className="t-btn t-btn--block"
                disabled={busy}
                onClick={() => kill.mutate({ id: sheetFor.id, reason: "dead" })}
              >
                Not interested
              </button>
              <button type="button" className="t-btn t-btn--block" disabled={busy} onClick={() => setSheetFor(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
