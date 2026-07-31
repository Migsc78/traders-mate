import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatGbp, tradieApi, type InvoiceDto } from "../../api/tradie";
import { openExternalUrl } from "../../lib/openExternalUrl";
import { EmptyState, QueryError, StatusPill } from "./ui";

export default function TradieInvoicesPage() {
  const qc = useQueryClient();
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const invoices = useQuery({ queryKey: ["tradie-invoices"], queryFn: () => tradieApi.invoices() });

  const send = useMutation({
    mutationFn: (id: string) => tradieApi.sendInvoice(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tradie-invoices"] }),
  });

  const markPaid = useMutation({
    mutationFn: (id: string) => tradieApi.markInvoicePaid(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tradie-invoices"] }),
  });

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [preview]);

  return (
    <div>
      <header className="t-page-head">
        <h2>Invoices</h2>
        <p>Create one from an accepted quote on the job page</p>
      </header>

      {invoices.isLoading && <p className="muted-text">Loading…</p>}
      <QueryError error={invoices.error} />

      <ul className="tradie-invoice-list">
        {(invoices.data || []).map((inv: InvoiceDto) => (
          <li key={inv.id}>
            <div className="tradie-invoice-card">
              <div className="t-invoice-top">
                <div className="t-invoice-who">
                  <strong>{inv.customerName || "Customer"}</strong>
                  <StatusPill status={inv.status} />
                  {inv.reference && <span className="t-invoice-ref">{inv.reference}</span>}
                </div>
                <div className="t-invoice-amount">
                  <span className="t-money">{formatGbp(inv.totalPence)}</span>
                </div>
              </div>

              {inv.paidReportedAt && inv.status !== "PAID" && (
                <p className="t-invoice-alert">Customer says they&apos;ve paid — check your bank, then confirm below.</p>
              )}

              <div className="t-invoice-actions">
                {inv.publicUrl && (
                  <button
                    type="button"
                    className="t-btn"
                    onClick={() =>
                      setPreview({
                        url: inv.publicUrl!,
                        title: inv.customerName || inv.reference || "Invoice",
                      })
                    }
                  >
                    View
                  </button>
                )}
                {(inv.status === "DRAFT" || inv.status === "SENT" || inv.status === "OVERDUE") && (
                  <button onClick={() => send.mutate(inv.id)} disabled={send.isPending}>
                    {inv.status === "DRAFT" ? "Send SMS" : "Resend"}
                  </button>
                )}
                {inv.status !== "PAID" && inv.status !== "VOID" && (
                  <button className="convert" onClick={() => markPaid.mutate(inv.id)} disabled={markPaid.isPending}>
                    Mark paid
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {invoices.data?.length === 0 && (
        <EmptyState title="No invoices yet" hint="Accept a quote, then create the invoice in one tap." />
      )}

      {preview && (
        <div className="t-doc-viewer" role="dialog" aria-modal="true" aria-label="Invoice preview">
          <div className="t-doc-viewer-bar">
            <button type="button" className="t-appbar-back" onClick={() => setPreview(null)}>
              <span aria-hidden="true">‹</span>
              <span>Invoices</span>
            </button>
            <p className="t-doc-viewer-title">{preview.title}</p>
            <button
              type="button"
              className="t-btn t-doc-viewer-ext"
              onClick={() => void openExternalUrl(preview.url).catch(() => undefined)}
            >
              Open
            </button>
          </div>
          <iframe className="t-doc-viewer-frame" title="Invoice" src={preview.url} />
        </div>
      )}
    </div>
  );
}
