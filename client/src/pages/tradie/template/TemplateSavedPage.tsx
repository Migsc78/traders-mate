import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatGbp, tradieApi } from "../../../api/tradie";
import { QueryError } from "../ui";
import { startQuote } from "../../../lib/newQuote";

/** Screen 6 — confirmation, with the fastest possible route into using it. */
export default function TemplateSavedPage() {
  const { templateId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const template = useQuery({
    queryKey: ["tradie-quote-template", templateId],
    queryFn: () => tradieApi.quoteTemplate(templateId),
    enabled: !!templateId,
  });

  const useInQuote = useMutation({
    mutationFn: () => {
      const t = template.data!;
      return startQuote(qc, {
        label: `Quote from ${t.name}`,
        templateId,
        lines: t.included.map((i) => ({
          label: i.label,
          qty: i.qty,
          unit: i.unit,
          unitPricePence: i.unitPricePence,
          vatRate: i.vatRate,
        })),
      });
    },
    onSuccess: (id) => navigate(`/t/quotes/${id}/edit`, { replace: true }),
  });

  if (template.isLoading) return <p className="muted-text">Loading…</p>;
  if (!template.data) return <QueryError error={template.error} />;

  const t = template.data;
  const subtotal = t.included.reduce((sum, i) => sum + i.unitPricePence * i.qty, 0);
  const vat = Math.round((subtotal * (t.vatRate ?? 20)) / 100);

  return (
    <div className="t-template-saved">
      <div className="t-saved-mark" aria-hidden="true">
        ✓
      </div>
      <h2 className="t-saved-title">{t.name}</h2>
      <p className="t-saved-pill">Saved successfully</p>

      <div className="t-card t-saved-summary">
        <p>
          <span>Included items</span>
          <span>{t.included.length}</span>
        </p>
        <p>
          <span>Optional add-ons</span>
          <span>{t.addOns.length}</span>
        </p>
        <p>
          <span>Estimated total (ex VAT)</span>
          <span>{formatGbp(subtotal)}</span>
        </p>
        <p>
          <span>VAT ({t.vatRate ?? 20}%)</span>
          <span>{formatGbp(vat)}</span>
        </p>
        <p className="t-totals-grand">
          <span>Total (inc VAT)</span>
          <span>{formatGbp(subtotal + vat)}</span>
        </p>
      </div>

      {t.useForAiDrafting && (
        <p className="t-saved-note">
          ✦ Available when starting a quote from Template, Notes or Voice.
        </p>
      )}

      <QueryError error={useInQuote.error} />

      <button
        type="button"
        className="primary t-btn--block"
        disabled={useInQuote.isPending || t.included.length === 0}
        onClick={() => useInQuote.mutate()}
      >
        {useInQuote.isPending ? "Building quote…" : "Use in quote"}
      </button>
      <Link className="t-btn t-btn--block" to={`/t/rates/templates/${templateId}/edit`} style={{ marginTop: 8 }}>
        Edit template
      </Link>
      <Link className="t-btn t-btn--block" to="/t/price-book" style={{ marginTop: 8 }}>
        Back to Rates
      </Link>
    </div>
  );
}
