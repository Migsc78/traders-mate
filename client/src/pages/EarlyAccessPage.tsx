import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

type Filter = "ALL" | "PENDING" | "APPROVED" | "DENIED";

type EarlyAccessRow = Awaited<ReturnType<typeof api.listEarlyAccess>>[number];

function statusBadge(status: string) {
  return status === "PENDING" ? "amber" : status === "APPROVED" ? "green" : "red";
}

function StatusBlock({ r }: { r: EarlyAccessRow }) {
  return (
    <>
      <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
      {r.inviteUsedAt && <div className="hint">Signed up</div>}
      {r.status === "APPROVED" && !r.inviteUsedAt && r.inviteExpiresAt && (
        <div className="hint">Invite until {new Date(r.inviteExpiresAt).toLocaleDateString("en-GB")}</div>
      )}
    </>
  );
}

export default function EarlyAccessPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("PENDING");
  const rows = useQuery({
    queryKey: ["early-access", filter],
    queryFn: () => api.listEarlyAccess(filter === "ALL" ? undefined : filter),
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.approveEarlyAccess(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["early-access"] }),
  });
  const deny = useMutation({
    mutationFn: (id: string) => api.denyEarlyAccess(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["early-access"] }),
  });

  const list: EarlyAccessRow[] = rows.data || [];

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Early access</h1>
          <p className="sub">Approve private-beta requests — they get a one-time signup link by SMS/email.</p>
        </div>
        <div className="mode-toggle">
          {(["ALL", "PENDING", "APPROVED", "DENIED"] as const).map((f) => (
            <button key={f} className={filter === f ? "primary" : undefined} type="button" onClick={() => setFilter(f)}>
              {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </header>

      {rows.isLoading && <p className="muted-text">Loading…</p>}
      {rows.isError && <p className="error">{(rows.error as Error).message}</p>}
      {(approve.error || deny.error) && (
        <p className="error">{((approve.error || deny.error) as Error).message}</p>
      )}

      <div className="mobile-only mobile-card-list">
        {list.map((r) => (
          <article key={r.id} className="mobile-card">
            <div className="mobile-card-top">
              <strong>{r.occupation}</strong>
              <StatusBlock r={r} />
            </div>
            <div className="mobile-card-meta">
              <span>{r.phone}</span>
              <span>{r.email}</span>
              <span>{new Date(r.createdAt).toLocaleString("en-GB")}</span>
            </div>
            {r.status === "PENDING" && (
              <div className="mobile-card-actions">
                <button
                  className="primary"
                  type="button"
                  disabled={approve.isPending}
                  onClick={() => approve.mutate(r.id)}
                >
                  Approve
                </button>
                <button type="button" disabled={deny.isPending} onClick={() => deny.mutate(r.id)}>
                  Deny
                </button>
              </div>
            )}
          </article>
        ))}
        {list.length === 0 && <p className="hint">No requests yet.</p>}
      </div>

      <div className="card desktop-only" style={{ padding: 0, overflow: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Occupation</th>
              <th>Mobile</th>
              <th>Email</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString("en-GB")}</td>
                <td>
                  <strong>{r.occupation}</strong>
                </td>
                <td>{r.phone}</td>
                <td>{r.email}</td>
                <td>
                  <StatusBlock r={r} />
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {r.status === "PENDING" && (
                    <>
                      <button
                        className="primary"
                        type="button"
                        disabled={approve.isPending}
                        onClick={() => approve.mutate(r.id)}
                      >
                        Approve
                      </button>{" "}
                      <button type="button" disabled={deny.isPending} onClick={() => deny.mutate(r.id)}>
                        Deny
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="hint" style={{ padding: 20 }}>
                  No requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
