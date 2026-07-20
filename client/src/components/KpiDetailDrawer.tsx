import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  api,
  type DashboardClientRow,
  type DashboardDetails,
  type DashboardEarlyAccessRow,
  type DashboardEnquiryRow,
  type DashboardInvoiceRow,
  type DashboardKpiKey,
  type DashboardLeadRow,
  type DashboardMessageRow,
  type DashboardMissedCallRow,
  type DashboardQuoteRow,
} from "../api/client";

function gbp(pence: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(status: string) {
  const s = status.toUpperCase();
  if (["ACTIVE", "PAID", "CONVERTED", "ROUTED", "ACCEPTED", "APPROVED"].includes(s)) return "green";
  if (["PENDING", "TRIAL", "QUALIFYING", "SENT", "HELD"].includes(s)) return "amber";
  if (["PAST_DUE", "OVERDUE", "FAILED", "SPAM", "DENIED", "EXPIRED", "SUSPENDED"].includes(s))
    return "red";
  return "navy";
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function KpiDetailDrawer({
  kpi,
  onClose,
}: {
  kpi: DashboardKpiKey;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const details = useQuery<DashboardDetails, Error>({
    queryKey: ["dashboard-details", kpi],
    queryFn: () => api.getDashboardDetails(kpi),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["dashboard-details", kpi] });
  };

  const showFlash = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 2500);
  };

  const approve = useMutation({
    mutationFn: (id: string) => api.approveEarlyAccess(id),
    onSuccess: () => {
      refreshAll();
      showFlash("Invite approved and sent");
    },
  });

  const deny = useMutation({
    mutationFn: (id: string) => api.denyEarlyAccess(id),
    onSuccess: () => {
      refreshAll();
      showFlash("Request denied");
    },
  });

  const setClientStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "SUSPENDED" | "CANCELLED" }) =>
      api.bulkSetClientStatus([id], status),
    onSuccess: () => {
      refreshAll();
      showFlash("Client status updated");
    },
  });

  const sendBilling = useMutation({
    mutationFn: (id: string) => api.sendClientInvoice(id),
    onSuccess: (r: { url: string; stub: boolean; delivered: boolean }) => {
      refreshAll();
      showFlash(r.delivered ? "Billing link texted" : "Billing link created (SMS may have failed)");
    },
  });

  const patchMissed = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patchDashboardMissedCall(id, status),
    onSuccess: () => {
      refreshAll();
      showFlash("Missed-call status updated");
    },
  });

  const patchInvoice = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "SENT" | "PAID" | "OVERDUE" | "VOID" }) =>
      api.patchDashboardInvoice(id, status),
    onSuccess: () => {
      refreshAll();
      showFlash("Invoice status updated");
    },
  });

  const data = details.data;
  const actionError =
    approve.error ||
    deny.error ||
    setClientStatus.error ||
    sendBilling.error ||
    patchMissed.error ||
    patchInvoice.error;

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="drawer drawer--wide kpi-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={data?.title || "KPI details"}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <h2>{data?.title || "Loading…"}</h2>
        {data?.description ? <p className="drawer-sync-note">{data.description}</p> : null}
        {data ? <p className="muted-text">{data.total} row{data.total === 1 ? "" : "s"}</p> : null}

        {flash && <p className="success">{flash}</p>}
        {details.isError && <p className="error">{(details.error as Error).message}</p>}
        {actionError && <p className="error">{(actionError as Error).message}</p>}
        {details.isLoading && <p className="muted-text">Loading details…</p>}

        {data?.kind === "messages" && data.links?.length ? (
          <div className="kpi-drawer-links">
            {data.links.map((l: { label: string; href: string }) => (
              <Link key={l.href} to={l.href} onClick={onClose}>
                {l.label} →
              </Link>
            ))}
          </div>
        ) : null}

        {data && data.rows.length === 0 && !details.isLoading && (
          <p className="muted-text">Nothing to show for this KPI right now.</p>
        )}

        {data?.kind === "clients" && (
          <ul className="kpi-detail-list">
            {data.rows.map((r: DashboardClientRow) => (
              <li key={r.id} className="kpi-detail-item">
                <div className="kpi-detail-top">
                  <div>
                    <strong>{r.businessName}</strong>
                    <div className="hint">
                      {[r.tradeTitle, r.town].filter(Boolean).join(" · ") || r.destPhone}
                    </div>
                  </div>
                  <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
                </div>
                {r.trialEndsAt && <div className="hint">Trial ends {when(r.trialEndsAt)}</div>}
                <div className="kpi-detail-actions">
                  <Link className="buttonish" to={`/admin/clients/${r.id}`} onClick={onClose}>
                    Open
                  </Link>
                  {r.status !== "ACTIVE" && (
                    <button
                      type="button"
                      disabled={setClientStatus.isPending}
                      onClick={() => setClientStatus.mutate({ id: r.id, status: "ACTIVE" })}
                    >
                      Set active
                    </button>
                  )}
                  {r.status !== "SUSPENDED" && (
                    <button
                      type="button"
                      disabled={setClientStatus.isPending}
                      onClick={() => setClientStatus.mutate({ id: r.id, status: "SUSPENDED" })}
                    >
                      Suspend
                    </button>
                  )}
                  <button
                    type="button"
                    className="primary"
                    disabled={sendBilling.isPending}
                    onClick={() => {
                      setBusyId(r.id);
                      sendBilling.mutate(r.id, { onSettled: () => setBusyId(null) });
                    }}
                  >
                    {busyId === r.id && sendBilling.isPending ? "Sending…" : "Send billing link"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {data?.kind === "early-access" && (
          <ul className="kpi-detail-list">
            {data.rows.map((r: DashboardEarlyAccessRow) => (
              <li key={r.id} className="kpi-detail-item">
                <div className="kpi-detail-top">
                  <div>
                    <strong>{r.occupation}</strong>
                    <div className="hint">
                      {r.phone} · {r.email}
                    </div>
                    <div className="hint">{when(r.createdAt)}</div>
                  </div>
                  <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
                </div>
                <div className="kpi-detail-actions">
                  <button
                    type="button"
                    className="primary"
                    disabled={approve.isPending}
                    onClick={() => approve.mutate(r.id)}
                  >
                    Approve
                  </button>
                  <button type="button" className="danger" disabled={deny.isPending} onClick={() => deny.mutate(r.id)}>
                    Deny
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {data?.kind === "enquiries" && (
          <ul className="kpi-detail-list">
            {data.rows.map((r: DashboardEnquiryRow) => (
              <li key={r.id} className="kpi-detail-item">
                <div className="kpi-detail-top">
                  <div>
                    <strong>{r.name}</strong>
                    <div className="hint">
                      {r.phone}
                      {r.postcode ? ` · ${r.postcode}` : ""} · {r.source}
                    </div>
                    <div className="hint">{when(r.createdAt)}</div>
                  </div>
                  <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
                </div>
                {r.message ? <p className="kpi-detail-msg">{r.message}</p> : null}
                <div className="kpi-detail-actions">
                  <Link to={`/admin/clients/${r.client.id}`} onClick={onClose}>
                    {r.client.businessName} →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        {data?.kind === "missed-calls" && (
          <ul className="kpi-detail-list">
            {data.rows.map((r: DashboardMissedCallRow) => (
              <li key={r.id} className="kpi-detail-item">
                <div className="kpi-detail-top">
                  <div>
                    <strong>{r.callerPhone}</strong>
                    <div className="hint">
                      {r.client.businessName} · {when(r.createdAt)}
                    </div>
                  </div>
                  <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
                </div>
                <div className="kpi-detail-actions">
                  <Link to={`/admin/clients/${r.client.id}`} onClick={onClose}>
                    Open client
                  </Link>
                  {r.status !== "SPAM" && (
                    <button
                      type="button"
                      disabled={patchMissed.isPending}
                      onClick={() => patchMissed.mutate({ id: r.id, status: "SPAM" })}
                    >
                      Mark spam
                    </button>
                  )}
                  {r.status !== "EXPIRED" && r.status !== "CONVERTED" && (
                    <button
                      type="button"
                      disabled={patchMissed.isPending}
                      onClick={() => patchMissed.mutate({ id: r.id, status: "EXPIRED" })}
                    >
                      Expire
                    </button>
                  )}
                  {(r.status === "SPAM" || r.status === "EXPIRED") && (
                    <button
                      type="button"
                      disabled={patchMissed.isPending}
                      onClick={() => patchMissed.mutate({ id: r.id, status: "PENDING" })}
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {data?.kind === "quotes" && (
          <ul className="kpi-detail-list">
            {data.rows.map((r: DashboardQuoteRow) => (
              <li key={r.id} className="kpi-detail-item">
                <div className="kpi-detail-top">
                  <div>
                    <strong>{r.customerName || "Customer"}</strong>
                    <div className="hint">
                      {r.client.businessName} · {gbp(r.totalPence)} · sent {when(r.sentAt)}
                    </div>
                  </div>
                  <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
                </div>
                <div className="kpi-detail-actions">
                  <Link to={`/admin/clients/${r.client.id}`} onClick={onClose}>
                    Open client
                  </Link>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await copyText(r.publicUrl);
                      showFlash(ok ? "Quote link copied" : "Could not copy");
                    }}
                  >
                    Copy quote link
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {data?.kind === "invoices" && (
          <ul className="kpi-detail-list">
            {data.rows.map((r: DashboardInvoiceRow) => (
              <li key={r.id} className="kpi-detail-item">
                <div className="kpi-detail-top">
                  <div>
                    <strong>{r.customerName || "Customer"}</strong>
                    <div className="hint">
                      {r.client.businessName} · {gbp(r.totalPence)}
                      {r.dueDate ? ` · due ${when(r.dueDate)}` : ""}
                    </div>
                  </div>
                  <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
                </div>
                <div className="kpi-detail-actions">
                  <Link to={`/admin/clients/${r.client.id}`} onClick={onClose}>
                    Open client
                  </Link>
                  {r.status !== "PAID" && (
                    <button
                      type="button"
                      className="primary"
                      disabled={patchInvoice.isPending}
                      onClick={() => patchInvoice.mutate({ id: r.id, status: "PAID" })}
                    >
                      Mark paid
                    </button>
                  )}
                  {r.status !== "OVERDUE" && r.status !== "PAID" && (
                    <button
                      type="button"
                      className="danger"
                      disabled={patchInvoice.isPending}
                      onClick={() => patchInvoice.mutate({ id: r.id, status: "OVERDUE" })}
                    >
                      Mark overdue
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await copyText(r.publicUrl);
                      showFlash(ok ? "Invoice link copied" : "Could not copy");
                    }}
                  >
                    Copy link
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {data?.kind === "leads" && (
          <ul className="kpi-detail-list">
            {data.rows.map((r: DashboardLeadRow) => (
              <li key={r.id} className="kpi-detail-item">
                <div className="kpi-detail-top">
                  <div>
                    <strong>{r.businessName}</strong>
                    <div className="hint">
                      {r.occupation} · {r.town}
                      {r.phone ? ` · ${r.phone}` : ""}
                    </div>
                  </div>
                  <span className={`badge ${statusBadge(r.outreachStatus)}`}>{r.outreachStatus}</span>
                </div>
                <div className="kpi-detail-actions">
                  <Link className="primary-link" to={`/admin/leads/${r.id}`} onClick={onClose}>
                    Open lead →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        {data?.kind === "messages" && (
          <ul className="kpi-detail-list">
            {data.rows.map((r: DashboardMessageRow) => (
              <li key={r.id} className="kpi-detail-item">
                <div className="kpi-detail-top">
                  <div>
                    <strong>
                      {r.channel} → {r.toAddr}
                    </strong>
                    <div className="hint">
                      {r.client.businessName} · {when(r.createdAt)} · {r.status}
                    </div>
                  </div>
                </div>
                <p className="kpi-detail-msg">{r.bodyPreview}</p>
                <div className="kpi-detail-actions">
                  <Link to={`/admin/clients/${r.client.id}`} onClick={onClose}>
                    Open client
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
