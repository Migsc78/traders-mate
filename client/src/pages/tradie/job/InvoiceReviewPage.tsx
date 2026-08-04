import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatGbp, sendOrQueue, tRequest, tradieApi } from "../../../api/tradie";
import { NeedsSignal, QueryError } from "../ui";
import { useOffline } from "../../../lib/connectivity";

type Preview = {
  lines: { label: string; qty: number; unit: string; netPence: number; vatRate: number; extra: boolean }[];
  subtotalPence: number;
  vatPence: number;
  totalPence: number;
  depositAppliedPence: number;
  amountDuePence: number;
  existingInvoice: { id: string; reference: string | null; status: string } | null;
};

/**
 * What the customer is about to be asked for, before anything is created.
 *
 * The deposit coming off is the line worth showing: "they already paid £500" is
 * exactly the fact that gets forgotten between the quote and the bill, and
 * finding out afterwards means an awkward phone call and a credit note.
 */
export default function InvoiceReviewPage() {
  const { enquiryId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const offline = useOffline();

  const preview = useQuery({
    queryKey: ["tradie-job-invoice-preview", enquiryId],
    queryFn: () => tRequest<Preview>(`/jobs/${enquiryId}/invoice/preview`),
    enabled: !!enquiryId,
  });

  const create = useMutation({
    mutationFn: () =>
      sendOrQueue<{ id: string }>({
        label: "Create invoice",
        path: `/jobs/${enquiryId}/invoice`,
        method: "POST",
        body: {},
        invalidates: ["tradie-job", "tradie-jobs", "tradie-invoices"],
      }),
    onSuccess: async (r) => {
      void qc.invalidateQueries({ queryKey: ["tradie-invoices"] });
      void qc.invalidateQueries({ queryKey: ["tradie-job", enquiryId] });
      if (!r.queued && confirm("Invoice created. Send it to the customer by SMS now?")) {
        await tradieApi.sendInvoice(r.result.id);
        void qc.invalidateQueries({ queryKey: ["tradie-jobs"] });
      }
      navigate("/t/invoices", { replace: true });
    },
  });

  if (preview.isLoading && !preview.data) return <p className="muted-text">Loading…</p>;
  if (!preview.data) {
    return (
      <div>
        <QueryError error={preview.error} />
        <p className="muted-text">Couldn&apos;t work out what to bill for this job.</p>
      </div>
    );
  }

  const p = preview.data;

  if (p.existingInvoice) {
    return (
      <div>
        <header className="t-page-head">
          <h2>Already invoiced</h2>
          <p>
            {p.existingInvoice.reference} · {p.existingInvoice.status}
          </p>
        </header>
        <p className="muted-text">
          This job has an invoice already. Raising a second one for the same work is almost never what
          you want.
        </p>
        <button
          type="button"
          className="primary t-btn--block"
          onClick={() => navigate("/t/invoices")}
        >
          Open invoices
        </button>
      </div>
    );
  }

  return (
    <div>
      <header className="t-page-head">
        <h2>Invoice review</h2>
        <p>Check it before the customer sees it</p>
      </header>

      <div className="t-card">
        <ul className="t-invoice-lines">
          {p.lines.map((l, i) => (
            <li key={i}>
              <span className="t-invoice-label">
                {l.label}
                {l.extra && <span className="t-pill t-pill--orange">Extra</span>}
                {l.qty !== 1 && (
                  <span className="muted-text">
                    {" "}
                    {l.qty} × {l.unit.toLowerCase()}
                  </span>
                )}
              </span>
              <span className="t-money">{formatGbp(Math.round(l.netPence * l.qty))}</span>
            </li>
          ))}
        </ul>

        <dl className="t-kv" style={{ marginTop: 10 }}>
          <div>
            <dt>Subtotal</dt>
            <dd>{formatGbp(p.subtotalPence)}</dd>
          </div>
          <div>
            <dt>VAT</dt>
            <dd>{formatGbp(p.vatPence)}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{formatGbp(p.totalPence)}</dd>
          </div>
          {p.depositAppliedPence > 0 && (
            <div>
              <dt>Deposit already paid</dt>
              <dd>−{formatGbp(p.depositAppliedPence)}</dd>
            </div>
          )}
        </dl>

        <div className="t-profit-total">
          <div>
            <span className="muted-text">Balance to pay</span>
            <strong className="t-money">{formatGbp(p.amountDuePence)}</strong>
          </div>
        </div>
      </div>

      <QueryError error={create.error} />
      {offline && <NeedsSignal>Creating the invoice needs signal.</NeedsSignal>}

      <button
        type="button"
        className="primary t-btn--block"
        disabled={offline || create.isPending || p.lines.length === 0}
        onClick={() => create.mutate()}
      >
        {create.isPending ? "Creating…" : "Create draft invoice"}
      </button>
      <p className="t-cta-hint">You&apos;ll be asked whether to send it straight away.</p>

      <button
        type="button"
        className="t-btn t-btn--block"
        style={{ marginTop: 8 }}
        onClick={() => navigate(`/t/jobs/${enquiryId}?tab=costs`)}
      >
        Something&apos;s missing — back to costs
      </button>
    </div>
  );
}
