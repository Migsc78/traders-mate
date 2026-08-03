import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { tradieApi } from "../api/tradie";
import { useOffline } from "./connectivity";

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Keeps the "can't do the job without this" data warm in the offline cache,
 * independent of which tabs the tradie happens to have opened. Today's cache
 * is reactive — it only remembers a page once visited — which is exactly why
 * a device that had never opened Rates showed an empty price book with no
 * signal. This runs once per online stretch and fills in the fixed set that
 * should never be missing: price book, customers, jobs, quotes, archived, and a
 * 14-day diary window (7 days each side of today).
 *
 * Job *detail* (notes/photos + the message thread) is prefetched for every
 * job in the list, not just open ones — /jobs already excludes archived jobs
 * on the server, so this stays a handful of requests rather than one per job
 * the tradie has ever had.
 */
export function useOfflinePrefetch(enabled: boolean): void {
  const qc = useQueryClient();
  const offline = useOffline();
  const ranForThisOnlineStretch = useRef(false);

  useEffect(() => {
    if (offline) {
      ranForThisOnlineStretch.current = false;
      return;
    }
    if (!enabled || ranForThisOnlineStretch.current) return;
    ranForThisOnlineStretch.current = true;

    const today = startOfDay(new Date());
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const thisWeek = { from: today.toISOString(), to: new Date(today.getTime() + weekMs).toISOString() };
    const lastWeek = { from: new Date(today.getTime() - weekMs).toISOString(), to: today.toISOString() };

    void qc.prefetchQuery({ queryKey: ["tradie-price-book"], queryFn: () => tradieApi.priceBook() });
    void qc.prefetchQuery({ queryKey: ["tradie-customers"], queryFn: () => tradieApi.customers() });
    void qc.prefetchQuery({ queryKey: ["tradie-quotes"], queryFn: () => tradieApi.quotes() });
    // The Archive tab on Jobs and Quotes reads this. One extra list, and without
    // it a tab the tradie can see sits empty the moment they lose signal.
    void qc.prefetchQuery({ queryKey: ["tradie-archived"], queryFn: () => tradieApi.archived() });
    // Templates and their contents, so a quote can be started from one with no signal.
    void qc
      .prefetchQuery({ queryKey: ["tradie-quote-templates"], queryFn: () => tradieApi.quoteTemplates() })
      .then(() => {
        const list = qc.getQueryData<{ id: string }[]>(["tradie-quote-templates"]) || [];
        for (const t of list) {
          void qc.prefetchQuery({
            queryKey: ["tradie-quote-template", t.id],
            queryFn: () => tradieApi.quoteTemplate(t.id),
          });
        }
      });
    void qc.prefetchQuery({
      queryKey: ["tradie-appointments", thisWeek.from, thisWeek.to],
      queryFn: () => tradieApi.appointments(thisWeek.from, thisWeek.to),
    });
    void qc.prefetchQuery({
      queryKey: ["tradie-appointments", lastWeek.from, lastWeek.to],
      queryFn: () => tradieApi.appointments(lastWeek.from, lastWeek.to),
    });

    void qc
      .prefetchQuery({ queryKey: ["tradie-jobs"], queryFn: () => tradieApi.jobs() })
      .then(() => {
        const jobs = qc.getQueryData<{ id: string }[]>(["tradie-jobs"]) || [];
        for (const job of jobs) {
          void qc.prefetchQuery({ queryKey: ["tradie-job", job.id], queryFn: () => tradieApi.job(job.id) });
          void qc.prefetchQuery({
            queryKey: ["tradie-messages", job.id],
            queryFn: () => tradieApi.jobMessages(job.id),
          });
        }
      });
  }, [enabled, offline, qc]);
}
