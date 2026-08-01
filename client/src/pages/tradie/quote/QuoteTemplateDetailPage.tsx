import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatGbp, tradieApi } from "../../../api/tradie";
import { startQuote } from "../../../lib/newQuote";
import { QueryError } from "../ui";

/**
 * Step 3 — what's in this template, and what can be added.
 *
 * Included lines are shown read-only: this is the "here's the scope" moment, and
 * editing happens on the next screen once it's a real quote. Add-ons are opt-in
 * so the headline price stays what the tradie normally charges.
 *
 * Lines are resolved here from the cached template rather than server-side, which
 * is both what makes this work with no signal and what guarantees the tradie
 * quotes the prices they were actually looking at.
 */
export default function QuoteTemplateDetailPage() {
  const { templateId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"included" | "addons">("included");
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const template = useQuery({
    queryKey: ["tradie-quote-template", templateId],
    queryFn: () => tradieApi.quoteTemplate(templateId),
    enabled: !!templateId,
  });

  const use = useMutation({
    mutationFn: () => {
      const t = template.data!;
      const picked = [...t.included, ...t.addOns.filter((a) => chosen.has(a.id))];
      return startQuote(qc, {
        label: `Quote from ${t.name}`,
        templateId,
        lines: picked.map((i) => ({
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

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (template.isLoading) return <p className="muted-text">Loading template…</p>;
  if (!template.data) return <QueryError error={template.error} />;

  const t = template.data;
  const includedTotal = t.included.reduce((sum, i) => sum + i.unitPricePence * i.qty, 0);
  const addOnTotal = t.addOns
    .filter((a) => chosen.has(a.id))
    .reduce((sum, i) => sum + i.unitPricePence * i.qty, 0);

  return (
    <div className="t-template-detail">
      {t.description && <p className="t-quote-lead">{t.description}</p>}

      <div className="t-seg" role="tablist" aria-label="Template contents">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "included"}
          className={tab === "included" ? "is-active" : undefined}
          onClick={() => setTab("included")}
        >
          Included ({t.included.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "addons"}
          className={tab === "addons" ? "is-active" : undefined}
          onClick={() => setTab("addons")}
        >
          Add-ons ({t.addOns.length})
        </button>
      </div>

      {tab === "included" ? (
        <ul className="t-template-items">
          {t.included.map((i) => (
            <li key={i.id}>
              <span className="t-template-item-label">{i.label}</span>
              <span className="t-template-item-qty">{i.qty}</span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="t-template-items">
          {t.addOns.map((a) => {
            const on = chosen.has(a.id);
            return (
              <li key={a.id}>
                <span className="t-template-item-label">{a.label}</span>
                <span className="t-template-item-price">+ {formatGbp(a.unitPricePence * a.qty)}</span>
                <button
                  type="button"
                  className={`t-addon-toggle${on ? " is-on" : ""}`}
                  aria-pressed={on}
                  aria-label={on ? `Remove ${a.label}` : `Add ${a.label}`}
                  onClick={() => toggle(a.id)}
                >
                  {on ? "−" : "+"}
                </button>
              </li>
            );
          })}
          {t.addOns.length === 0 && <li className="muted-text">No add-ons on this template.</li>}
        </ul>
      )}

      <p className="t-template-total">
        <span>Estimate</span>
        <strong>{formatGbp(includedTotal + addOnTotal)}</strong>
      </p>

      <QueryError error={use.error} />

      <button
        type="button"
        className="primary t-btn--block"
        disabled={use.isPending}
        onClick={() => use.mutate()}
      >
        {use.isPending ? "Building quote…" : "Use this template"}
      </button>
    </div>
  );
}
