import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatGbp, sendOrQueue, tradieApi, type PriceBookItem } from "../../../api/tradie";
import { jobsApi, type JobCost } from "../../../api/jobs";
import { MoneyInput, NumberInput } from "../../../components/NumericInput";
import { marginLabel } from "../../../lib/margin";
import { NeedsSignal, QueryError } from "../ui";
import { useOffline } from "../../../lib/connectivity";

const TYPES: { id: JobCost["type"]; label: string; hint: string }[] = [
  { id: "MATERIAL", label: "Material", hint: "Parts, fittings, a boiler" },
  { id: "LABOUR", label: "Labour", hint: "Time on the job" },
  { id: "EXPENSE", label: "Expense", hint: "Parking, congestion, skip hire" },
  { id: "SUBCONTRACTOR", label: "Subcontractor", hint: "Someone else's invoice" },
];

const UNITS = ["EACH", "HOUR", "DAY", "JOB", "METRE"];

/** Price-book prices are what the customer pays, VAT included. Costs are net. */
function netOf(pence: number, vatRate: number): number {
  return Math.round(pence / (1 + vatRate / 100));
}

/**
 * One cost line — added, or corrected after the fact.
 *
 * The price book is the fast path: tap a rate and the label, unit, charge and
 * cost all arrive together, which is the difference between recording a receipt
 * and not bothering. Everything typed here is ex-VAT, because that is the only
 * basis on which profit means anything.
 */
export default function CostFormPage() {
  const { enquiryId = "", costId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const offline = useOffline();

  const editing = !!costId;
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<PriceBookItem | null>(null);

  const existing = useQuery({
    queryKey: ["tradie-job-costs", enquiryId],
    queryFn: () => jobsApi.costs(enquiryId),
    enabled: !!enquiryId,
  });
  const current = editing ? existing.data?.costs.find((c) => c.id === costId) : undefined;

  const book = useQuery({
    queryKey: ["tradie-price-book"],
    queryFn: () => tradieApi.priceBook(),
    enabled: !editing,
  });

  const [type, setType] = useState<JobCost["type"]>("MATERIAL");
  const [label, setLabel] = useState("");
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState("EACH");
  const [sellPence, setSellPence] = useState(0);
  const [costPence, setCostPence] = useState<number | null>(null);
  const [vatRate, setVatRate] = useState(20);
  const [billable, setBillable] = useState(true);
  const [isExtra, setIsExtra] = useState(params.get("extra") === "1");
  const [agreedVia, setAgreedVia] = useState("phone");
  const [seeded, setSeeded] = useState(false);

  // Fill the form from the line being edited, once.
  if (editing && current && !seeded) {
    setSeeded(true);
    setType(current.type);
    setLabel(current.label);
    setQty(current.qty);
    setUnit(current.unit);
    setSellPence(current.sellPricePence);
    setCostPence(current.unitCostPence);
    setVatRate(current.vatRate);
    setBillable(current.billable);
    setIsExtra(current.isExtra);
    setAgreedVia(current.agreedVia || "phone");
  }

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return [];
    return (book.data || [])
      .filter((i) => i.active)
      .filter((i) => i.label.toLowerCase().includes(needle) || (i.sku || "").toLowerCase().includes(needle))
      .slice(0, 8);
  }, [book.data, search]);

  const pick = (item: PriceBookItem) => {
    setPicked(item);
    setLabel(item.label);
    setUnit(item.unit);
    setVatRate(item.vatRate);
    setSellPence(netOf(item.unitPricePence, item.vatRate));
    setCostPence(item.costPricePence);
    setType(item.unit === "HOUR" || item.unit === "DAY" ? "LABOUR" : "MATERIAL");
    setSearch("");
  };

  const save = useMutation({
    mutationFn: () =>
      sendOrQueue({
        label: `${editing ? "Update" : "Add"} cost · ${label}`,
        path: editing ? `/jobs/${enquiryId}/costs/${costId}` : `/jobs/${enquiryId}/costs`,
        method: editing ? "PATCH" : "POST",
        body: {
          type,
          label: label.trim(),
          qty,
          unit,
          sellPricePence: sellPence,
          unitCostPence: costPence,
          vatRate,
          billable,
          isExtra,
          agreedVia: isExtra ? agreedVia : null,
          priceBookItemId: picked?.id ?? null,
        },
        invalidates: ["tradie-job-costs", "tradie-job", "tradie-jobs"],
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tradie-job-costs", enquiryId] });
      void qc.invalidateQueries({ queryKey: ["tradie-job", enquiryId] });
      navigate(`/t/jobs/${enquiryId}?tab=costs`, { replace: true });
    },
  });

  const remove = useMutation({
    mutationFn: () =>
      sendOrQueue({
        label: `Remove cost · ${label}`,
        path: `/jobs/${enquiryId}/costs/${costId}`,
        method: "DELETE",
        body: {},
        invalidates: ["tradie-job-costs", "tradie-job"],
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tradie-job-costs", enquiryId] });
      void qc.invalidateQueries({ queryKey: ["tradie-job", enquiryId] });
      navigate(`/t/jobs/${enquiryId}?tab=costs`, { replace: true });
    },
  });

  const ready = label.trim().length >= 2;
  const lineMargin = marginLabel(sellPence, costPence);

  return (
    <div className="t-customer-form">
      {!editing && (
        <>
          <label className="t-field">
            Find a rate
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your price book…"
            />
            <span className="t-field-hint">
              Picking a rate brings its price and its cost across in one tap.
            </span>
          </label>
          {matches.length > 0 && (
            <ul className="t-list t-book-matches">
              {matches.map((i) => (
                <li key={i.id}>
                  <button type="button" className="t-card t-cost-row" onClick={() => pick(i)}>
                    <div className="t-cost-main">
                      <strong>{i.label}</strong>
                      <span className="t-row-sub">
                        {i.unit} · {formatGbp(i.unitPricePence)} inc VAT
                      </span>
                    </div>
                    <div className="t-cost-money">
                      {i.costPricePence != null ? (
                        <span className="muted-text">cost {formatGbp(i.costPricePence)}</span>
                      ) : (
                        <span className="t-margin t-margin--unset">no cost</span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="t-field-label">Kind</p>
      <ul className="t-choice-list">
        {TYPES.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className={`t-choice-row${t.id === type ? " is-active" : ""}`}
              aria-pressed={t.id === type}
              onClick={() => setType(t.id)}
            >
              <span className="t-choice-main">
                <strong>{t.label}</strong>
                <span className="muted-text">{t.hint}</span>
              </span>
              <span className="t-choice-radio" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <label className="t-field">
        What is it
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Worcester Greenstar 30i" />
      </label>

      <div className="t-two-fields">
        <label>
          Quantity
          <NumberInput value={qty} onValue={setQty} />
        </label>
        <label>
          Unit
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="t-two-fields">
        <label>
          Charging £ (ex VAT)
          <MoneyInput pence={sellPence} onPence={setSellPence} />
        </label>
        <label>
          What it cost me £
          <MoneyInput pence={costPence ?? 0} onPence={(p) => setCostPence(p || null)} />
        </label>
      </div>
      <p className="t-field-hint">
        {/* Blank cost is honest; zero is a claim. Saying so here stops a tradie
            typing 0 to make the warning go away. */}
        {lineMargin ?? "Leave the cost blank if you don't know it yet — the job's profit says so rather than guessing."}
      </p>

      <label className="t-toggle-row">
        <span>
          <strong>Charge the customer</strong>
          <span className="muted-text">Off for something you swallowed — it still comes off your profit</span>
        </span>
        <input type="checkbox" role="switch" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
      </label>

      <label className="t-toggle-row">
        <span>
          <strong>Extra work</strong>
          <span className="muted-text">Beyond the quoted price, agreed on site</span>
        </span>
        <input type="checkbox" role="switch" checked={isExtra} onChange={(e) => setIsExtra(e.target.checked)} />
      </label>

      {isExtra && (
        <label className="t-field">
          How did they agree?
          <select value={agreedVia} onChange={(e) => setAgreedVia(e.target.value)}>
            <option value="phone">On the phone</option>
            <option value="in person">In person</option>
            <option value="message">By message</option>
          </select>
          <span className="t-field-hint">
            Recorded with today&apos;s date. If it&apos;s ever queried, this is the answer.
          </span>
        </label>
      )}

      <QueryError error={save.error || remove.error} />
      {offline && <NeedsSignal>Saved on your phone and synced when you&apos;re back in range.</NeedsSignal>}

      <button
        type="button"
        className="primary t-btn--block"
        disabled={!ready || save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Saving…" : editing ? "Save changes" : "Add to job"}
      </button>

      {editing && (
        <button
          type="button"
          className="danger t-btn--block"
          style={{ marginTop: 8 }}
          disabled={remove.isPending || !!current?.invoicedAt}
          onClick={() => {
            if (confirm(`Remove “${label}” from this job?`)) remove.mutate();
          }}
        >
          Remove line
        </button>
      )}
      {current?.invoicedAt && (
        <p className="t-cta-hint">This line is already on an invoice, so it can&apos;t be changed.</p>
      )}
    </div>
  );
}
