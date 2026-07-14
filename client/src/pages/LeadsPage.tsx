import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Lead, LeadFilters, OutreachStatus } from "../types";
import FilterBar from "../components/FilterBar";
import LeadsTable from "../components/LeadsTable";
import LeadDrawer from "../components/LeadDrawer";
import ScoreLegend from "../components/ScoreLegend";
import ProgressOverlay from "../components/ProgressOverlay";

const DEFAULT_FILTERS: LeadFilters = {
  websiteClass: [],
  qualified: true,
  sort: "priorityScore",
  order: "desc",
  page: 1,
  pageSize: 50,
};

export default function LeadsPage() {
  const [searchParams] = useSearchParams();
  const searchRunId = searchParams.get("searchRunId") ?? undefined;
  const qc = useQueryClient();

  const [filters, setFilters] = useState<LeadFilters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState("");
  const [refreshPercent, setRefreshPercent] = useState(0);
  const [refreshResult, setRefreshResult] = useState<{ refreshed: number; failed: number } | null>(null);

  const effective = useMemo(() => ({ ...filters, searchRunId }), [filters, searchRunId]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["leads", effective],
    queryFn: () => api.listLeads(effective as LeadFilters),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OutreachStatus }) => api.updateLead(id, { outreachStatus: status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  const patch = (p: Partial<LeadFilters>) => setFilters((f) => ({ ...f, ...p }));

  const toggleSort = (col: LeadFilters["sort"]) =>
    patch({ sort: col, order: filters.sort === col && filters.order === "desc" ? "asc" : "desc" });

  const leads = data?.data ?? [];

  useEffect(() => {
    setOpenLead((current) => {
      if (!current) return current;
      return leads.find((l: Lead) => l.id === current.id) ?? current;
    });
  }, [leads]);

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((s) => {
      if (leads.every((l: Lead) => s.has(l.id))) return new Set<string>();
      return new Set<string>(leads.map((l: Lead) => l.id));
    });

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / filters.pageSize));
  const selectedIds = Array.from(selected);

  const bulkRefresh = useMutation({
    mutationFn: () =>
      api.refreshLeadsWithProgress(selectedIds, (p) => {
        setRefreshMessage(p.message);
        setRefreshPercent(p.percent);
      }),
    onMutate: () => {
      setRefreshing(true);
      setRefreshResult(null);
      setRefreshMessage("Starting refresh…");
      setRefreshPercent(0);
    },
    onSuccess: (result: { refreshed: number; failed: number; errors?: string[] }) => {
      setRefreshResult({ refreshed: result.refreshed, failed: result.failed });
      setRefreshPercent(100);
      setRefreshMessage(
        result.failed
          ? `${result.refreshed} refreshed, ${result.failed} failed`
          : `All ${result.refreshed} leads refreshed`
      );
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err: unknown) => {
      setRefreshMessage(err instanceof Error ? err.message : "Refresh failed");
    },
    onSettled: () => {
      window.setTimeout(() => setRefreshing(false), 600);
    },
  });

  const bulkScreen = useMutation({
    mutationFn: () => api.bulkMarkScreened(selectedIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  return (
    <div className="page">
      <ProgressOverlay
        visible={refreshing}
        title="Refreshing from Google"
        message={refreshMessage}
        percent={refreshPercent}
      />

      <div className="page-head">
        <div>
          <h1>Leads</h1>
          <p className="sub">
            {total} {filters.qualified ? "qualified " : ""}lead{total === 1 ? "" : "s"}
            {searchRunId ? " from this search" : ""}
            {" · "}
            <span className="saved-note">Saved locally — browsing this list does not call Google.</span>
          </p>
        </div>
        <div className="head-actions">
          <button onClick={() => api.exportCsv()}>Export CSV (all)</button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="bulk-actions">
          <span className="bulk-count">{selected.size} selected</span>
          <button onClick={() => bulkRefresh.mutate()} disabled={bulkRefresh.isPending}>
            {bulkRefresh.isPending ? "Refreshing…" : "Refresh from Google"}
          </button>
          <button onClick={() => bulkScreen.mutate()} disabled={bulkScreen.isPending}>
            {bulkScreen.isPending ? "Updating…" : "Mark TPS-screened"}
          </button>
          <button onClick={() => api.exportCsv(selectedIds)}>Export selected</button>
          <button className="linkish" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
          {bulkRefresh.isError && !refreshing && (
            <span className="error inline-error">{(bulkRefresh.error as Error).message}</span>
          )}
          {refreshResult && refreshResult.failed > 0 && !refreshing && (
            <span className="muted-text">
              {refreshResult.refreshed} refreshed, {refreshResult.failed} failed
            </span>
          )}
        </div>
      )}

      <ScoreLegend />

      <FilterBar filters={filters} onChange={patch} />

      {isLoading && <p>Loading…</p>}
      {isError && <p className="error">{(error as Error).message}</p>}

      {!isLoading && !isError && (
        <>
          <LeadsTable
            leads={leads}
            selected={selected}
            onToggleSelect={toggleSelect}
            onToggleAll={toggleAll}
            sort={filters.sort}
            order={filters.order}
            onSort={toggleSort}
            onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
            onOpen={setOpenLead}
          />

          <div className="pager">
            <button disabled={filters.page <= 1} onClick={() => patch({ page: filters.page - 1 })}>
              ← Prev
            </button>
            <span>
              Page {filters.page} / {pages}
            </span>
            <button disabled={filters.page >= pages} onClick={() => patch({ page: filters.page + 1 })}>
              Next →
            </button>
          </div>
        </>
      )}
      {openLead && (
        <LeadDrawer
          lead={openLead}
          onClose={() => setOpenLead(null)}
          onLeadUpdated={() => qc.invalidateQueries({ queryKey: ["leads"] })}
        />
      )}
    </div>
  );
}
