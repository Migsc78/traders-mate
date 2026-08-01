import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatGbp, tradieApi, type TemplateItemInput } from "../../../api/tradie";
import { QueryError } from "../ui";
import { MoneyInput, NumberInput } from "../../../components/NumericInput";
import { saveTemplate } from "../../../lib/newTemplate";

const DEPOSITS = [0, 10, 20, 25, 50];

/** Screen 5 — review items, split included vs add-ons, set VAT, deposit and notes. */
export default function TemplateEditPage() {
  const { templateId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const template = useQuery({
    queryKey: ["tradie-quote-template", templateId],
    queryFn: () => tradieApi.quoteTemplate(templateId),
    enabled: !!templateId,
  });

  const [items, setItems] = useState<TemplateItemInput[] | null>(null);
  const [vatRate, setVatRate] = useState(20);
  const [depositPercent, setDepositPercent] = useState(0);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);

  useEffect(() => {
    if (!template.data || items !== null) return;
    const t = template.data;
    setItems([
      ...t.included.map((i) => ({ ...i, isAddOn: false })),
      ...t.addOns.map((i) => ({ ...i, isAddOn: true })),
    ]);
    setVatRate(t.vatRate ?? 20);
    setDepositPercent(t.depositPercent ?? 0);
    setNotes(t.notes || "");
    if (t.notes) setShowNotes(true);
  }, [template.data, items]);

  const save = useMutation({
    mutationFn: () =>
      saveTemplate(qc, templateId, {
        name: template.data?.name || "Template",
        vatRate,
        depositPercent: depositPercent || null,
        notes: notes.trim() || null,
        items: (items || []).filter((i) => i.label.trim()),
      }),
    onSuccess: () => navigate(`/t/rates/templates/${templateId}/saved`, { replace: true }),
  });

  if (template.isLoading || items === null) return <p className="muted-text">Loading template…</p>;
  if (!template.data) return <QueryError error={template.error} />;

  const update = (idx: number, patch: Partial<TemplateItemInput>) =>
    setItems((prev) => (prev || []).map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const included = items.map((it, i) => ({ it, i })).filter(({ it }) => !it.isAddOn);
  const addOns = items.map((it, i) => ({ it, i })).filter(({ it }) => it.isAddOn);
  const subtotal = items
    .filter((i) => !i.isAddOn)
    .reduce((sum, i) => sum + i.unitPricePence * i.qty, 0);
  const vat = Math.round((subtotal * vatRate) / 100);

  const renderRow = (it: TemplateItemInput, i: number) => (
    <li key={i}>
      <input
        className="t-line-label"
        value={it.label}
        placeholder="Item name"
        onChange={(e) => update(i, { label: e.target.value })}
      />
      <div className="t-line-fields">
        <NumberInput aria-label="Quantity" value={it.qty} onValue={(qty) => update(i, { qty })} />
        <span className="muted-text">{it.unit}</span>
        <MoneyInput
          aria-label="Price"
          pence={it.unitPricePence}
          onPence={(unitPricePence) => update(i, { unitPricePence })}
        />
        <button
          type="button"
          className="t-line-remove"
          aria-label={it.isAddOn ? `Make ${it.label} included` : `Make ${it.label} an add-on`}
          title={it.isAddOn ? "Move to included" : "Move to add-ons"}
          onClick={() => update(i, { isAddOn: !it.isAddOn })}
        >
          {it.isAddOn ? "↑" : "↓"}
        </button>
        <button
          type="button"
          className="t-line-remove"
          aria-label={`Remove ${it.label}`}
          onClick={() => setItems((prev) => (prev || []).filter((_, j) => j !== i))}
        >
          ×
        </button>
      </div>
    </li>
  );

  const addBlank = (isAddOn: boolean) =>
    setItems((prev) => [
      ...(prev || []),
      { label: "", qty: 1, unit: "JOB", unitPricePence: 0, vatRate, isAddOn },
    ]);

  return (
    <div className="t-template-edit">
      <p className="t-section-label">Included items</p>
      <ul className="t-lines">{included.map(({ it, i }) => renderRow(it, i))}</ul>
      <button type="button" className="t-btn" onClick={() => addBlank(false)}>
        + Add item
      </button>

      <p className="t-section-label" style={{ marginTop: 20 }}>
        Optional add-ons
      </p>
      <ul className="t-lines">{addOns.map(({ it, i }) => renderRow(it, i))}</ul>
      <button type="button" className="t-btn" onClick={() => addBlank(true)}>
        + Add add-on
      </button>

      <div className="t-totals">
        <p>
          <span>Subtotal</span>
          <span>{formatGbp(subtotal)}</span>
        </p>
        <p>
          <span>VAT ({vatRate}%)</span>
          <span>{formatGbp(vat)}</span>
        </p>
        <p className="t-totals-grand">
          <span>Total</span>
          <span>{formatGbp(subtotal + vat)}</span>
        </p>
      </div>

      <div className="t-two-fields">
        <label className="t-field">
          VAT rate
          <select value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))}>
            {[0, 5, 20].map((r) => (
              <option key={r} value={r}>
                {r}%
              </option>
            ))}
          </select>
        </label>
        <label className="t-field">
          Deposit (optional)
          <select value={depositPercent} onChange={(e) => setDepositPercent(Number(e.target.value))}>
            {DEPOSITS.map((d) => (
              <option key={d} value={d}>
                {d === 0 ? "No deposit" : `${d}%`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        className="t-disclosure"
        aria-expanded={showNotes}
        onClick={() => setShowNotes((v) => !v)}
      >
        Notes / exclusions (optional)
        <span aria-hidden="true">{showNotes ? "⌃" : "›"}</span>
      </button>
      {showNotes && (
        <textarea
          rows={3}
          className="t-notes-area"
          placeholder="What isn't covered — making good, scaffolding, parts on top…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      )}

      <QueryError error={save.error} />

      <button
        type="button"
        className="primary t-btn--block"
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Saving…" : "Save template"}
      </button>

      <Link className="t-btn t-btn--block" to={`/t/rates/templates/${templateId}/items`} style={{ marginTop: 8 }}>
        Add from price book
      </Link>
    </div>
  );
}
