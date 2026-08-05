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
import { IconSearch, ListToolbar, useListFilter, type ListTab } from "./ListToolbar";
import { groupByDay } from "../../lib/dateGroups";
import { ageLabel, ageTone, stampLabel } from "../../lib/age";

type ConvoTurn = { role: "assistant" | "user"; text: string; at: string | null };

type InboxItem = {
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
  conversation: ConvoTurn[];
  conversationSnippet: string | null;
  photoUrls: string[];
  createdAt: string;
};

/**
 * What the badge says about where this lead came from.
 *
 * A lead the tradie typed in himself hasn't been through the qualifier, so
 * calling it a "likely job" would be the app taking credit for his judgement —
 * and worse, it would look identical to a guess the app actually made. Saying
 * how it arrived is both more honest and more useful.
 */
function originLabel(item: InboxItem): string {
  if (item.source === "manual") return "Manually entered";
  switch (item.triage) {
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

function originPill(item: InboxItem): string {
  if (item.source === "manual") return "t-pill t-pill--slate";
  switch (item.triage) {
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

const URGENCY_LABEL: Record<string, string> = {
  ASAP: "ASAP",
  THIS_WEEK: "This week",
  FLEXIBLE: "Flexible",
};

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

const TABS: readonly ListTab[] = [
  { id: "all", label: "All" },
  { id: "needs", label: "Needs you" },
  { id: "manual", label: "Added by you" },
  { id: "spam", label: "Spam" },
];

function matches(item: InboxItem, needle: string): boolean {
  if (!needle) return true;
  return [item.name, item.phone, item.postcode, item.addressLine, item.summary, item.message]
    .filter(Boolean)
    .some((f) => String(f).toLowerCase().includes(needle));
}

export default function TradieInboxPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sheetFor, setSheetFor] = useState<InboxItem | null>(null);
  const [sheetError, setSheetError] = useState("");
  const { tab, setTab, query, setQuery, searchOpen, toggleSearch } = useListFilter("all");

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
    // Without this a failure is indistinguishable from a slow success: the sheet
    // just sits there. Silence is how a working button gets reported as broken.
    onError: (err: Error) => setSheetError(err.message),
  });

  const kill = useMutation({
    mutationFn: (opts: { id: string; reason: "dead" | "spam" }) => tradieApi.killJob(opts.id, opts.reason),
    onSuccess: () => {
      setSheetFor(null);
      void qc.invalidateQueries({ queryKey: ["tradie-inbox"] });
    },
    onError: (err: Error) => setSheetError(err.message),
  });

  const all: InboxItem[] = useMemo(() => inbox.data?.items || [], [inbox.data]);
  const needle = query.trim().toLowerCase();

  const counts = useMemo(
    () => ({
      all: all.filter((i) => i.triage !== "SPAM").length,
      needs: all.filter((i) => i.triage !== "SPAM").length,
      manual: all.filter((i) => i.source === "manual").length,
      spam: all.filter((i) => i.triage === "SPAM").length,
    }),
    [all]
  );

  /**
   * Newest first, split by the day it came in.
   *
   * Spam is kept out of All rather than sorted below it — a caught telesales
   * call isn't something the tradie should have to scroll past to reach a real
   * one, and it has its own tab for when he wants to check nothing was caught
   * by mistake.
   */
  const groups = useMemo(() => {
    const rows = all
      .filter((i) => {
        if (tab === "spam") return i.triage === "SPAM";
        if (tab === "manual") return i.source === "manual";
        return i.triage !== "SPAM";
      })
      .filter((i) => matches(i, needle))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return groupByDay(rows, (i) => i.createdAt);
  }, [all, tab, needle]);

  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const busy = promote.isPending || kill.isPending;

  return (
    <div>
      <header className="t-page-head t-page-head--row">
        <div>
          <h2>Inbox</h2>
          <p>Missed calls and new leads — call back, make a job, or kill</p>
        </div>
        <div className="t-head-actions">
          <button
            type="button"
            className={`t-icon-btn${searchOpen ? " is-active" : ""}`}
            aria-label={searchOpen ? "Close search" : "Search inbox"}
            aria-pressed={searchOpen}
            onClick={toggleSearch}
          >
            <IconSearch />
          </button>
          <Link className="t-add-btn" to="/t/inbox/new" aria-label="Add enquiry">
            +
          </Link>
        </div>
      </header>

      <ListToolbar
        tabs={TABS}
        tab={tab}
        onTab={setTab}
        query={query}
        onQuery={setQuery}
        searchOpen={searchOpen}
        placeholder="Search name, number or postcode"
        counts={counts}
        // Leads waiting on a reply are the only count worth interrupting for.
        accentTabs={["needs"]}
      />

      {inbox.isLoading && <p className="muted-text">Loading inbox…</p>}
      <QueryError error={inbox.error} />

      {groups.map((group) => (
        <section key={group.key} className="t-day-group">
          <h3 className="t-day-head">{group.label}</h3>
          <ul className="t-list">
            {group.rows.map((item) => {
              const tone = ageTone(item.createdAt);
              return (
                <li key={item.id}>
                  <button type="button" className="t-row t-row--btn" onClick={() => {
                      setSheetError("");
                      setSheetFor(item);
                    }}>
                    <div className="t-row-main">
                      <div className="t-row-top">
                        <strong>{item.name}</strong>
                        <span className={originPill(item)}>{originLabel(item)}</span>
                        {item.urgency === "ASAP" && <span className="t-pill t-pill--red">ASAP</span>}
                      </div>
                      <span className="t-row-sub">
                        {[
                          item.phone,
                          item.postcode,
                          item.distanceMiles != null ? `~${item.distanceMiles} mi` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {(item.summary || item.message) && (
                        <span className="t-row-snip">{item.summary || item.message}</span>
                      )}
                    </div>
                    <div className="t-row-side t-row-side--stack">
                      {/* Age leads. How long it's been waiting is what decides
                          whether to ring now; the clock time is reference. */}
                      <span className={`t-age${tone ? ` t-age--${tone}` : ""}`}>{ageLabel(item.createdAt)}</span>
                      <IconChevron />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* Require real data (even stale/cached), not just "no error yet" — otherwise a
          failed fetch with no cache reads as a reassuring "Inbox is clear". */}
      {inbox.data && total === 0 && needle && (
        <EmptyState title={`Nothing matches “${query.trim()}”`} hint="Try a name, number or postcode." />
      )}

      {inbox.data && total === 0 && !needle && tab === "spam" && (
        <EmptyState title="Nothing caught" hint="Telesales and obvious junk end up here." />
      )}

      {inbox.data && total === 0 && !needle && tab === "manual" && (
        <EmptyState title="Nothing added by hand" hint="Tap + when a call comes straight to your mobile." />
      )}

      {inbox.data && total === 0 && !needle && (tab === "all" || tab === "needs") && (
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

            <div className="t-sheet-meta">
              <span className={originPill(sheetFor)}>{originLabel(sheetFor)}</span>
              {sheetFor.urgency && (
                <span className={`t-pill ${sheetFor.urgency === "ASAP" ? "t-pill--red" : "t-pill--slate"}`}>
                  {URGENCY_LABEL[sheetFor.urgency] || sheetFor.urgency}
                </span>
              )}
              <span
                className={`t-age${ageTone(sheetFor.createdAt) ? ` t-age--${ageTone(sheetFor.createdAt)}` : ""}`}
              >
                {ageLabel(sheetFor.createdAt)}
              </span>
            </div>
            <p className="t-sheet-stamp">{stampLabel(sheetFor.createdAt)}</p>

            {(sheetFor.addressLine || sheetFor.postcode) && (
              <p className="t-sheet-where">
                {[sheetFor.addressLine, sheetFor.postcode].filter(Boolean).join(", ")}
              </p>
            )}

            {/*
              The whole exchange, not a précis of it. What the customer actually
              typed is the bit worth reading before ringing back — a summary is
              where "it's coming through the ceiling" goes to die.
            */}
            {sheetFor.conversation.length > 0 ? (
              <ul className="t-convo">
                {sheetFor.conversation.map((turn, i) => (
                  <li key={i} className={`t-convo-turn t-convo-turn--${turn.role}`}>
                    <span className="t-convo-who">
                      {turn.role === "user" ? sheetFor.name.split(" ")[0] : "Auto-reply"}
                    </span>
                    <p>{turn.text}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-sheet-message">
                {sheetFor.message || sheetFor.summary || "No details taken."}
              </p>
            )}

            {sheetFor.photoUrls.length > 0 && (
              <div className="t-photo-row" style={{ marginBottom: 12 }}>
                {sheetFor.photoUrls.map((url) => (
                  <a key={url} className="t-photo-slot is-filled" href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt="" />
                  </a>
                ))}
              </div>
            )}

            {/*
              Ringing back comes first because it is what actually wins the job,
              and it's the one action that works whether or not the lead turns
              into anything. The three paths below it are the same three the PRD
              puts behind a "New work" chooser — they belong here, at the moment
              the tradie decides what this lead is, rather than on a screen of
              their own that has to ask who the customer is all over again.
            */}
            {sheetError && <p className="error">{sheetError}</p>}

            <div className="t-sheet-actions">
              <a className="primary t-btn--block t-sheet-call" href={`tel:${sheetFor.phone}`}>
                <IconPhone /> Call back
              </a>

              {PATHS.map((p) => {
                const working = promote.isPending && promote.variables?.path === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`t-path-card${working ? " is-working" : ""}`}
                    disabled={busy}
                    aria-busy={working}
                    onClick={() => promote.mutate({ id: sheetFor.id, path: p.id })}
                  >
                    <span className={`t-path-icon t-path-icon--${p.id}`} aria-hidden="true">
                      <p.Icon />
                    </span>
                    <span className="t-path-main">
                      <strong>{p.label}</strong>
                      {/*
                        The tapped card says so the instant it's tapped. This write
                        talks to the database before it can navigate, and on a slow
                        connection that is seconds of a screen doing nothing — which
                        a tradie reads as a broken button and taps again.
                      */}
                      <span className="muted-text">{working ? "Setting the job up…" : p.hint}</span>
                    </span>
                    {working ? <span className="t-spinner" aria-hidden="true" /> : <IconChevron />}
                  </button>
                );
              })}

              <button
                type="button"
                className="danger t-btn--block"
                disabled={busy}
                onClick={() => kill.mutate({ id: sheetFor.id, reason: "spam" })}
              >
                {kill.isPending && kill.variables?.reason === "spam" ? "Marking…" : "Spam"}
              </button>
              <button
                type="button"
                className="t-btn t-btn--block"
                disabled={busy}
                onClick={() => kill.mutate({ id: sheetFor.id, reason: "dead" })}
              >
                {kill.isPending && kill.variables?.reason === "dead" ? "Closing…" : "Not interested"}
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
