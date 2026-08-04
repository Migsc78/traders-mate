import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoneyInput } from "../../../components/NumericInput";
import { PRICE_UNITS } from "../../../lib/priceBookFile";
import { categoryLabel } from "../../../lib/rateCategories";
import { createRate, type RateDraft } from "../../../lib/newRate";
import { marginLabel } from "../../../lib/margin";
import { IconChevron, QueryError } from "../ui";

/** What survives the trip to the category picker and back. */
export type RateFormState = {
  label: string;
  sku: string;
  category: string;
  unit: string;
  unitPricePence: number;
  costPricePence: number | null;
  vatRate: number;
  active: boolean;
  isCallout: boolean;
};

export const EMPTY_RATE_FORM: RateFormState = {
  label: "",
  sku: "",
  category: "",
  unit: "JOB",
  unitPricePence: 0,
  costPricePence: null,
  vatRate: 20,
  active: true,
  isCallout: false,
};

const VAT_RATES = [20, 5, 0];

/**
 * The in-progress form, kept outside React.
 *
 * Router state covers the normal path through the picker, but not the shell's
 * Back link or the Android back button — and a tradie who taps back to check the
 * category list shouldn't come back to an empty form. Module scope means it dies
 * with the session, which is right: this is a half-typed form, not saved data.
 */
let lastForm: RateFormState | null = null;

export function recallRateForm(): RateFormState {
  return lastForm ?? EMPTY_RATE_FORM;
}

/**
 * Screen 2 of the rate wireframe — the core details.
 *
 * The form lives in router state rather than component state so stepping out to
 * the category picker and back doesn't lose the price they just typed. Losing a
 * half-filled form to a navigation is exactly the sort of thing that stops
 * someone bothering to keep their rates up to date.
 */
export default function RateNewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  const passed = (location.state as { form?: RateFormState } | null)?.form;
  const [form, setForm] = useState<RateFormState>(passed ?? recallRateForm());

  useEffect(() => {
    lastForm = form;
  }, [form]);

  const set = <K extends keyof RateFormState>(key: K, value: RateFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const draft: RateDraft = {
        label: form.label.trim(),
        sku: form.sku.trim() || null,
        category: form.category || "OTHER",
        unit: form.unit,
        unitPricePence: form.unitPricePence,
        costPricePence: form.costPricePence,
        vatRate: form.vatRate,
        isCallout: form.isCallout,
        active: form.active,
      };
      return createRate(qc, draft);
    },
    // Land back on Rates with the new item's section open and filtered to it,
    // so the tradie sees where it went rather than having to hunt for it.
    onSuccess: () => {
      lastForm = null; // next + starts blank
      navigate(`/t/price-book?cat=${form.category || "OTHER"}`, { replace: true });
    },
  });

  const ready = form.label.trim().length >= 2;

  return (
    <div className="t-rate-form">
      <label className="t-field">
        Label
        <input
          value={form.label}
          onChange={(e) => set("label", e.target.value)}
          placeholder="e.g. Labour hour"
          autoFocus
        />
      </label>

      <label className="t-field">
        SKU (optional)
        <input
          value={form.sku}
          onChange={(e) => set("sku", e.target.value)}
          placeholder="e.g. LAB-HOUR"
          autoCapitalize="characters"
        />
      </label>

      <p className="t-field-label">Category</p>
      <button
        type="button"
        className="t-picker-row"
        onClick={() =>
          navigate("/t/rates/new/category", { state: { form } })
        }
      >
        <span className={form.category ? undefined : "muted-text"}>
          {form.category ? categoryLabel(form.category) : "Select category"}
        </span>
        <IconChevron />
      </button>

      <label className="t-field">
        Unit
        <select value={form.unit} onChange={(e) => set("unit", e.target.value)}>
          {PRICE_UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </label>

      <div className="t-two-fields">
        <label>
          Price £
          <MoneyInput pence={form.unitPricePence} onPence={(p) => set("unitPricePence", p)} />
        </label>
        <label>
          VAT %
          {/* 20 / 5 / 0 covers UK trades. A rate needing anything else can be
              typed in the price-book grid on the Rates screen. */}
          <select value={form.vatRate} onChange={(e) => set("vatRate", Number(e.target.value))}>
            {VAT_RATES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="t-field">
        What it costs me £
        <MoneyInput
          pence={form.costPricePence ?? 0}
          onPence={(p) => set("costPricePence", p || null)}
        />
        <span className="t-field-hint">
          {/* Optional, and it says so. Half a price book with costs is still
              useful; nagging for it is how a tradie stops adding rates at all. */}
          {marginLabel(form.unitPricePence, form.costPricePence) ??
            "Optional — add it and every job using this rate shows what you made."}
        </span>
      </label>

      <label className="t-toggle-row">
        <span>
          <strong>Active</strong>
          <span className="muted-text">Available for quotes</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={form.active}
          onChange={(e) => set("active", e.target.checked)}
        />
      </label>

      <label className="t-toggle-row">
        <span>
          <strong>Call-out</strong>
          <span className="muted-text">Mark as call-out item</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={form.isCallout}
          onChange={(e) => set("isCallout", e.target.checked)}
        />
      </label>

      <QueryError error={save.error} />

      {form.category ? (
        <button
          type="button"
          className="primary t-btn--block"
          disabled={!ready || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Save rate item"}
        </button>
      ) : (
        <button
          type="button"
          className="primary t-btn--block"
          disabled={!ready}
          onClick={() => navigate("/t/rates/new/category", { state: { form } })}
        >
          Next: Choose category
        </button>
      )}
    </div>
  );
}
