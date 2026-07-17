import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Client, ClientStatus, Channel } from "../types";
import { CLIENT_STATUSES, CHANNELS } from "../types";

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: "badge green",
  PAST_DUE: "badge amber",
  SUSPENDED: "badge red",
  CANCELLED: "badge grey",
};

const emptyDraft = {
  businessName: "",
  tradeTitle: "",
  town: "",
  postcode: "",
  destPhone: "",
  destChannel: "SMS" as Channel,
};

export default function ClientsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ClientStatus | "">("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [bulkNotice, setBulkNotice] = useState("");

  const { data, isLoading, isError, error } = useQuery({ queryKey: ["clients"], queryFn: () => api.listClients() });
  const allClients: Client[] = data ?? [];

  const clients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allClients.filter((c: Client) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (!q) return true;
      return [c.businessName, c.town, c.routeKey, c.destPhone, c.tradeTitle]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [allClients, search, statusFilter]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["clients"] });
  };

  const createClient = useMutation({
    mutationFn: () =>
      api.createClient({
        businessName: draft.businessName,
        tradeTitle: draft.tradeTitle || undefined,
        town: draft.town || undefined,
        postcode: draft.postcode || undefined,
        destPhone: draft.destPhone,
        destChannel: draft.destChannel,
      }),
    onSuccess: (c: Client) => {
      invalidate();
      setDraft(emptyDraft);
      setShowAdd(false);
      navigate(`/admin/clients/${c.id}`);
    },
  });

  const deleteOne = useMutation({
    mutationFn: (id: string) => api.deleteClient(id),
    onSuccess: (_r: { ok: boolean }, id: string) => {
      setSelected((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
      invalidate();
    },
  });

  const bulkDelete = useMutation({
    mutationFn: () => api.bulkDeleteClients(Array.from(selected)),
    onSuccess: (r: { deleted: number }) => {
      setBulkNotice(`Deleted ${r.deleted} client${r.deleted === 1 ? "" : "s"}.`);
      setSelected(new Set());
      invalidate();
    },
  });

  const bulkStatus = useMutation({
    mutationFn: (status: ClientStatus) => api.bulkSetClientStatus(Array.from(selected), status),
    onSuccess: (r: { updated: number }, status: ClientStatus) => {
      setBulkNotice(`Set ${r.updated} client${r.updated === 1 ? "" : "s"} to ${status}.`);
      invalidate();
    },
  });

  const bulkInvoice = useMutation({
    mutationFn: () => api.bulkSendClientInvoices(Array.from(selected)),
    onSuccess: (r: { sent: number; results: { id: string; ok: boolean; delivered?: boolean; error?: string }[] }) => {
      const delivered = r.results.filter((x) => x.delivered).length;
      setBulkNotice(`Sent ${r.sent} billing link${r.sent === 1 ? "" : "s"} (${delivered} delivered by SMS/WhatsApp).`);
    },
  });

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((s) => {
      if (clients.length > 0 && clients.every((c) => s.has(c.id))) return new Set<string>();
      return new Set<string>(clients.map((c) => c.id));
    });

  const allSelected = clients.length > 0 && clients.every((c) => selected.has(c.id));

  const confirmDelete = (c: Client) => {
    if (window.confirm(`Delete ${c.businessName}? This removes their enquiry history too.`)) {
      deleteOne.mutate(c.id);
    }
  };

  const confirmBulkDelete = () => {
    if (window.confirm(`Delete ${selected.size} selected client${selected.size === 1 ? "" : "s"}? This can't be undone.`)) {
      bulkDelete.mutate();
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Clients</h1>
          <p className="sub">
            {allClients.length} client{allClients.length === 1 ? "" : "s"} · leads routed to their phone, gated on payment
          </p>
        </div>
        <div className="head-actions">
          <button onClick={() => setShowAdd((v) => !v)}>{showAdd ? "Cancel" : "+ Add client"}</button>
        </div>
      </div>

      {showAdd && (
        <div className="card filters">
          <div className="filter-row add-client-form">
            <label>
              Business name
              <input value={draft.businessName} onChange={(e) => setDraft((d) => ({ ...d, businessName: e.target.value }))} />
            </label>
            <label>
              Trade
              <input value={draft.tradeTitle} onChange={(e) => setDraft((d) => ({ ...d, tradeTitle: e.target.value }))} />
            </label>
            <label>
              Town
              <input value={draft.town} onChange={(e) => setDraft((d) => ({ ...d, town: e.target.value }))} />
            </label>
            <label>
              Postcode
              <input value={draft.postcode} onChange={(e) => setDraft((d) => ({ ...d, postcode: e.target.value }))} />
            </label>
            <label>
              Destination phone
              <input value={draft.destPhone} onChange={(e) => setDraft((d) => ({ ...d, destPhone: e.target.value }))} />
            </label>
            <label>
              Channel
              <select value={draft.destChannel} onChange={(e) => setDraft((d) => ({ ...d, destChannel: e.target.value as Channel }))}>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="drawer-actions">
            <button
              className="primary"
              onClick={() => createClient.mutate()}
              disabled={createClient.isPending || !draft.businessName || !draft.destPhone}
            >
              {createClient.isPending ? "Adding…" : "Add client"}
            </button>
          </div>
          {createClient.isError && <p className="error">{(createClient.error as Error).message}</p>}
        </div>
      )}

      <div className="card filters">
        <div className="filter-row">
          <label>
            Search
            <input
              placeholder="Business, town, phone, route key…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            Status
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ClientStatus | "")}>
              <option value="">Any</option>
              {CLIENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="bulk-actions">
          <span className="bulk-count">{selected.size} selected</span>
          <button onClick={() => bulkInvoice.mutate()} disabled={bulkInvoice.isPending}>
            {bulkInvoice.isPending ? "Sending…" : "Send invoice"}
          </button>
          <button onClick={() => bulkStatus.mutate("ACTIVE")} disabled={bulkStatus.isPending}>
            Set active
          </button>
          <button onClick={() => bulkStatus.mutate("SUSPENDED")} disabled={bulkStatus.isPending}>
            Suspend
          </button>
          <button className="danger" onClick={confirmBulkDelete} disabled={bulkDelete.isPending}>
            {bulkDelete.isPending ? "Deleting…" : "Delete"}
          </button>
          <button className="linkish" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
          {(bulkDelete.isError || bulkStatus.isError || bulkInvoice.isError) && (
            <span className="error inline-error">
              {((bulkDelete.error || bulkStatus.error || bulkInvoice.error) as Error).message}
            </span>
          )}
        </div>
      )}
      {bulkNotice && (
        <p className="muted-text">
          {bulkNotice}{" "}
          <button className="linkish" onClick={() => setBulkNotice("")}>
            dismiss
          </button>
        </p>
      )}

      {isLoading && <p>Loading…</p>}
      {isError && <p className="error">{(error as Error).message}</p>}

      {!isLoading && !isError && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="col-check">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                <th>Business</th>
                <th>Town</th>
                <th>Route key</th>
                <th>Destination</th>
                <th>Channel</th>
                <th>Site</th>
                <th>Leads (30d)</th>
                <th>Held</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c: Client) => (
                <tr key={c.id} className={selected.has(c.id) ? "sel" : ""}>
                  <td>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} />
                  </td>
                  <td>
                    <button className="link" onClick={() => navigate(`/admin/clients/${c.id}`)}>
                      {c.businessName}
                    </button>
                  </td>
                  <td>{c.town || "—"}</td>
                  <td>
                    <code>{c.routeKey}</code>
                  </td>
                  <td>{c.destPhone}</td>
                  <td>{c.destChannel}</td>
                  <td>
                    {c.sitePreviewUrl || c.siteSlug ? (
                      <a href={c.sitePreviewUrl || `/sites/${c.siteSlug}/`} target="_blank" rel="noreferrer">
                        Open ↗
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <strong>{c.leads30 ?? 0}</strong>
                  </td>
                  <td>{c.heldTotal ? <span className="badge amber">{c.heldTotal}</span> : "—"}</td>
                  <td>
                    <span className={STATUS_CLASS[c.status] || "badge grey"}>{c.status}</span>
                  </td>
                  <td>
                    <button className="linkish" onClick={() => confirmDelete(c)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={11} className="empty">
                    {allClients.length === 0
                      ? "No clients yet. Convert a lead from the Leads page to create one, or add one manually above."
                      : "No clients match your search/filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
