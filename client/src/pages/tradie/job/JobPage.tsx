import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTradieSession, sendOrQueue, tradieApi } from "../../../api/tradie";
import { commercialTone, jobsApi, operationalTone, type PrimaryAction } from "../../../api/jobs";
import { QueryError } from "../ui";
import { ListToolbar, useListFilter, type ListTab } from "../ListToolbar";
import { useOffline } from "../../../lib/connectivity";
import OverviewTab from "./tabs/OverviewTab";
import VisitsTab from "./tabs/VisitsTab";
import CostsTab from "./tabs/CostsTab";
import QuoteTab from "./tabs/QuoteTab";
import MessagesTab from "./tabs/MessagesTab";

const TABS: readonly ListTab[] = [
  { id: "overview", label: "Overview" },
  { id: "visits", label: "Visits" },
  { id: "costs", label: "Costs" },
  { id: "quote", label: "Quote" },
  { id: "messages", label: "Messages" },
];

/**
 * One job, six ways.
 *
 * The header carries both statuses and the single action that matters right
 * now — derived server-side so the button and the endpoint behind it can't
 * drift. Everything else is a tab, because a tradie standing in a plant room
 * wants one screen at a time, not a page they have to scroll.
 */
export default function JobPage() {
  const { enquiryId = "" } = useParams();
  const session = getTradieSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const offline = useOffline();
  const { tab, setTab, query, setQuery, searchOpen } = useListFilter("overview");
  const [actionError, setActionError] = useState("");

  const detail = useQuery({
    queryKey: ["tradie-job", enquiryId],
    queryFn: () => jobsApi.detail(enquiryId),
    enabled: !!session && !!enquiryId,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["tradie-job", enquiryId] });
    void qc.invalidateQueries({ queryKey: ["tradie-jobs"] });
    void qc.invalidateQueries({ queryKey: ["tradie-appointments"] });
  };

  /**
   * The state moves happen on site, where signal is worst.
   *
   * Queued when there's none: "on my way" tapped in a lane with no bars still
   * has to land, and the server treats a replayed transition as success rather
   * than an error, so a retry hours later is harmless.
   */
  const move = useMutation({
    mutationFn: (action: "on-my-way" | "start" | "complete") =>
      sendOrQueue({
        label: `${action.replace(/-/g, " ")} · ${detail.data?.job.title ?? "job"}`,
        path: `/jobs/${enquiryId}/${action}`,
        method: "POST",
        body: {},
        invalidates: ["tradie-job", "tradie-jobs", "tradie-appointments"],
      }),
    onSuccess: (r) => {
      setActionError("");
      if (!r.queued) invalidate();
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const makeInvoice = useMutation({
    mutationFn: (quoteId: string) => tradieApi.invoiceFromQuote(quoteId),
    onSuccess: () => {
      setActionError("");
      void qc.invalidateQueries({ queryKey: ["tradie-invoices"] });
      navigate("/t/invoices");
    },
    onError: (err: Error) => setActionError(err.message),
  });

  if (!session) return <Navigate to="/t/auth" replace />;
  if (detail.isLoading && !detail.data) return <p>Loading…</p>;
  // With a cached copy we render anyway — the address and the contact number are
  // the whole reason to open this page with no signal.
  if (detail.isError && !detail.data) return <p className="error">{(detail.error as Error).message}</p>;
  if (!detail.data) return <p className="muted-text">This job couldn&apos;t be loaded.</p>;

  const d = detail.data;
  const job = d.job;

  const runAction = (action: PrimaryAction["action"]) => {
    switch (action) {
      case "schedule":
        navigate(`/t/jobs/${enquiryId}/schedule`);
        return;
      case "on-my-way":
      case "start":
        move.mutate(action);
        return;
      case "complete":
        navigate(`/t/jobs/${enquiryId}/complete`);
        return;
      case "invoice": {
        const quoteId = job.latestQuote?.id;
        if (quoteId) makeInvoice.mutate(quoteId);
        return;
      }
      case "record-payment":
        navigate("/t/invoices");
        return;
      default:
    }
  };

  const cta = job.primaryAction;
  // Invoicing straight from recorded costs isn't wired yet, so a job with no
  // quote has nothing to build an invoice from. It says so rather than failing
  // when tapped.
  const ctaBlocked =
    cta.action === "invoice" && !job.latestQuote
      ? "No quote on this job yet — billing straight from the Costs tab is coming next."
      : cta.action === "invoice" && offline
        ? "Invoicing needs signal."
        : null;

  return (
    <div className="t-job-page">
      <header className="t-job-head">
        <div className="t-job-id">
          <h1>{job.title}</h1>
          <p className="muted-text">
            {[job.reference, job.customer?.name || d.name, job.property?.postcode || d.postcode]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="t-badge-row">
            <span className={`t-pill ${operationalTone(job.operational)}`}>{job.operationalLabel}</span>
            <span className={`t-pill ${commercialTone(job.commercial)}`}>{job.commercialLabel}</span>
          </div>
        </div>
      </header>

      <ListToolbar
        tabs={TABS}
        tab={tab}
        onTab={setTab}
        query={query}
        onQuery={setQuery}
        searchOpen={searchOpen}
        placeholder="Search this job"
      />

      {actionError && <p className="error">{actionError}</p>}
      <QueryError error={detail.error} />

      {tab === "overview" && <OverviewTab detail={d} />}
      {tab === "visits" && <VisitsTab detail={d} />}
      {tab === "costs" && <CostsTab detail={d} />}
      {tab === "quote" && <QuoteTab detail={d} />}
      {tab === "messages" && <MessagesTab jobId={enquiryId} />}

      {/* Sticky, because on site the tradie's thumb is already at the bottom of
          the screen and the next action shouldn't need a scroll to find. */}
      {cta.action !== "none" && (
        <div className="t-job-cta">
          <button
            type="button"
            className="primary t-btn--block"
            disabled={!cta.enabled || !!ctaBlocked || move.isPending || makeInvoice.isPending}
            onClick={() => runAction(cta.action)}
          >
            {move.isPending || makeInvoice.isPending ? "Saving…" : cta.label}
          </button>
          {(ctaBlocked || cta.hint) && <p className="t-cta-hint">{ctaBlocked || cta.hint}</p>}
        </div>
      )}
    </div>
  );
}
