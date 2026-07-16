import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatGbp, tradieApi, type InvoiceDto } from "../../api/tradie";

export default function TradieInvoicesPage() {
  const qc = useQueryClient();
  const invoices = useQuery({ queryKey: ["tradie-invoices"], queryFn: () => tradieApi.invoices() });

  const send = useMutation({
    mutationFn: (id: string) => tradieApi.sendInvoice(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tradie-invoices"] }),
  });

  const markPaid = useMutation({
    mutationFn: (id: string) => tradieApi.markInvoicePaid(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tradie-invoices"] }),
  });

  return (
    <div>
      <h2>Invoices</h2>
      <p className="muted-text">Create from an accepted quote on the job page</p>
      {invoices.isLoading && <p>Loading…</p>}
      {invoices.isError && <p className="error">{(invoices.error as Error).message}</p>}
      <ul className="tradie-invoice-list">
        {(invoices.data || []).map((inv: InvoiceDto) => (
          <li key={inv.id} className="tradie-invoice-card">
            <div>
              <strong>{inv.customerName || "Customer"}</strong>
              <span className="muted-text">
                {" "}
                · {inv.status} · {formatGbp(inv.totalPence)}
                {inv.reference ? ` · ${inv.reference}` : ""}
              </span>
              {inv.paidReportedAt && inv.status !== "PAID" && (
                <p className="error">Customer reported payment — confirm below</p>
              )}
            </div>
            <div className="tradie-actions">
              {inv.publicUrl && (
                <a href={inv.publicUrl} target="_blank" rel="noreferrer">
                  View
                </a>
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
          </li>
        ))}
      </ul>
      {invoices.data?.length === 0 && <p className="muted-text">No invoices yet.</p>}
    </div>
  );
}
