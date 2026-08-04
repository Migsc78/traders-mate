import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { MoneyInput, NumberInput } from "../../../components/NumericInput";
import {
  downloadPriceBookTemplate,
  exportPriceBook,
  parsePriceBookFile,
  PRICE_UNITS,
  type PriceBookImportRow,
  type PriceBookRow,
} from "../../../lib/priceBookFile";
import { categoryOf, RATE_CATEGORIES, type RateCategoryId } from "../../../lib/rateCategories";
import { marginLabel, marginPct, marginTone } from "../../../lib/margin";
import { formatGbp, sendOrQueue, tradieApi } from "../../../api/tradie";
import { useOffline } from "../../../lib/connectivity";
import { QueryError } from "../../../components/QueryError";
import { RateCategoryIcon } from "./RateCategoryIcon";

type Indexed = { row: PriceBookRow; idx: number };

/**
 * The tradie's price book — screens 1 and 4 of the rate wireframe.
 *
 * Browsing and editing are the same screen: sections collapse so a book with
 * forty rates isn't a wall of inputs, and a row opens into the full editor in
 * place. Everything except Excel import works with no signal, because the rates
 * are the one thing a tradie needs when they're standing in someone's kitchen
 * working out a price.
 */
export default function RatesBook() {
  const qc = useQueryClient();
  const offline = useOffline();
  const fileRef = useRef<HTMLInputElement>(null);
  const [params, setParams] = useSearchParams();

  const [rows, setRows] = useState<PriceBookRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const filter = (params.get("cat") || "ALL").toUpperCase();
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(filter === "ALL" ? [] : [filter])
  );

  const list = useQuery({ queryKey: ["tradie-price-book"], queryFn: () => tradieApi.priceBook() });

  useEffect(() => {
    if (list.data && !dirty) {
      setRows(list.data.map((r) => ({ ...r, sku: r.sku ?? "" })));
    }
  }, [list.data, dirty]);

  const save = useMutation({
    mutationFn: () =>
      saveRows(
        rows
          .filter((r) => r.label.trim())
          .map((r) => ({
            ...r,
            sku: r.sku?.trim() ? r.sku.trim() : null,
            label: r.label.trim(),
            unitPricePence: Math.max(0, Math.round(Number(r.unitPricePence) || 0)),
            // A cost left at zero is treated as never entered, so an untouched
            // rate doesn't come back claiming a 100% margin.
            costPricePence: r.costPricePence ? Math.max(0, Math.round(r.costPricePence)) : null,
            vatRate: Number(r.vatRate) || 20,
          }))
      ),
    onSuccess: (saved: PriceBookRow[]) => {
      setDirty(false);
      setRows(saved.map((r) => ({ ...r, sku: r.sku ?? "" })));
      setNotice(`Saved ${saved.length} rate${saved.length === 1 ? "" : "s"}.`);
      setError("");
      void qc.invalidateQueries({ queryKey: ["tradie-price-book"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => tradieApi.deactivatePriceBookItem(id),
    onSuccess: () => {
      setDirty(false);
      setNotice("Rate deactivated.");
      void qc.invalidateQueries({ queryKey: ["tradie-price-book"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const doImport = useMutation({
    mutationFn: (importRows: PriceBookImportRow[]) => tradieApi.importPriceBook(importRows),
    onSuccess: (r) => {
      setDirty(false);
      setRows(r.items.map((i) => ({ ...i, sku: i.sku ?? "" })));
      setNotice(`Import done — ${r.created} created, ${r.updated} updated, ${r.skipped} skipped.`);
      setError("");
      void qc.invalidateQueries({ queryKey: ["tradie-price-book"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const update = (idx: number, patch: Partial<PriceBookRow>) => {
    setDirty(true);
    setNotice("");
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    try {
      const parsed = await parsePriceBookFile(file);
      if (!parsed.length) {
        setError("No valid rows found in that file.");
        return;
      }
      doImport.mutate(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read file");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const needle = search.trim().toLowerCase();

  /** Rows that survive the search box, keyed back to their index in `rows`. */
  const matching = useMemo<Indexed[]>(
    () =>
      rows
        .map((row, idx) => ({ row, idx }))
        .filter(({ row }) =>
          needle
            ? row.label.toLowerCase().includes(needle) ||
              (row.sku || "").toLowerCase().includes(needle)
            : true
        ),
    [rows, needle]
  );

  const grouped = useMemo(() => {
    const map = new Map<RateCategoryId, Indexed[]>(RATE_CATEGORIES.map((c) => [c.id, []]));
    for (const item of matching) map.get(categoryOf(item.row))!.push(item);
    return map;
  }, [matching]);

  const visibleCategories = RATE_CATEGORIES.filter(
    (c) => filter === "ALL" || c.id === filter
  ).filter((c) => (grouped.get(c.id) || []).length > 0 || (filter === c.id && !needle));

  // A search is a request to see the matches, not to go hunting for which
  // section they're hiding in.
  const expanded = (id: RateCategoryId) => (needle ? true : open.has(id));

  const toggleSection = (id: RateCategoryId) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setFilter = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === "ALL") next.delete("cat");
    else next.set("cat", id);
    setParams(next, { replace: true });
    if (id !== "ALL") setOpen((prev) => new Set(prev).add(id));
  };

  const addBlankTo = (category: RateCategoryId) => {
    setDirty(true);
    setNotice("");
    setRows((prev) => [
      ...prev,
      {
        sku: "",
        label: "",
        category,
        unit: "JOB",
        unitPricePence: 0,
        // Null, not zero: a brand-new rate has no cost recorded yet, and zero
        // would read as "this is free" and quietly claim full margin.
        costPricePence: null,
        vatRate: 20,
        isCallout: category === "CALLOUT",
        active: true,
      },
    ]);
    setOpen((prev) => new Set(prev).add(category));
    setEditing(`new-${rows.length}`);
  };

  return (
    <div className="t-rates">
      <div className="t-search-wrap">
        <input
          className="t-search-input"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search rates…"
          aria-label="Search rates"
        />
      </div>

      <div className="t-chip-row">
        <button
          type="button"
          className={`t-chip${filter === "ALL" ? " is-active" : ""}`}
          onClick={() => setFilter("ALL")}
        >
          All
        </button>
        {RATE_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`t-chip${filter === c.id ? " is-active" : ""}`}
            onClick={() => setFilter(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="t-rates-tools">
        <Link className="t-btn" to="/t/rates/templates">
          Template
        </Link>
        <button type="button" onClick={() => exportPriceBook(rows)} disabled={!rows.length}>
          Export
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={offline || doImport.isPending}
        >
          {doImport.isPending ? "Importing…" : "Import Excel"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          hidden
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <p className="t-blank-sheet">
        <button type="button" className="linkish" onClick={() => downloadPriceBookTemplate()}>
          Download blank sheet
        </button>{" "}
        <span className="muted-text">for bulk entry in Excel</span>
      </p>

      {list.isLoading && <p className="muted-text">Loading…</p>}
      <QueryError error={list.error} />
      {error && <p className="error">{error}</p>}
      {notice && <p className="muted-text">{notice}</p>}

      {visibleCategories.map((c) => {
        const items = grouped.get(c.id) || [];
        const isOpen = expanded(c.id);
        return (
          <section key={c.id} className="t-rate-section">
            <button
              type="button"
              className="t-rate-section-head"
              aria-expanded={isOpen}
              onClick={() => toggleSection(c.id)}
            >
              <span className="t-rate-section-icon" aria-hidden="true">
                <RateCategoryIcon category={c.id} />
              </span>
              <strong>{c.label}</strong>
              <span className="muted-text">
                {items.length} item{items.length === 1 ? "" : "s"}
              </span>
              <span className={`t-rate-caret${isOpen ? " is-open" : ""}`} aria-hidden="true">
                ⌄
              </span>
            </button>

            {isOpen && (
              <div className="t-rate-section-body">
                {items.map(({ row, idx }) => {
                  const key = row.id || `new-${idx}`;
                  const isEditing = editing === key;
                  return (
                    <div key={key} className={`t-rate-item${row.active ? "" : " is-inactive"}`}>
                      <button
                        type="button"
                        className="t-rate-item-head"
                        aria-expanded={isEditing}
                        onClick={() => setEditing(isEditing ? null : key)}
                      >
                        <span className="t-rate-item-main">
                          <strong>{row.label || "Untitled rate"}</strong>
                          <span className="muted-text">
                            {row.unit}
                            {row.sku ? ` · ${row.sku}` : ""} · VAT {row.vatRate}%
                          </span>
                        </span>
                        <span className="t-rate-item-side">
                          <span className="t-money">{formatGbp(row.unitPricePence)}</span>
                          {/* Margin only where a cost is actually recorded. A rate
                              with no cost says so rather than implying 100%. */}
                          {marginLabel(row.unitPricePence, row.costPricePence) ? (
                            <span className={`t-margin t-margin--${marginTone(row.unitPricePence, row.costPricePence) || "ok"}`}>
                              {marginPct(row.unitPricePence, row.costPricePence)}%
                            </span>
                          ) : (
                            <span className="t-margin t-margin--unset">cost not set</span>
                          )}
                        </span>
                      </button>

                      {isEditing && (
                        <div className="t-rate-item-edit">
                          <label>
                            Label
                            <input
                              value={row.label}
                              onChange={(e) => update(idx, { label: e.target.value })}
                              placeholder="Label"
                            />
                          </label>
                          <div className="t-two-fields">
                            <label>
                              SKU
                              <input
                                value={row.sku ?? ""}
                                onChange={(e) => update(idx, { sku: e.target.value })}
                                placeholder="CALL"
                              />
                            </label>
                            <label>
                              Unit
                              <select
                                value={row.unit}
                                onChange={(e) => update(idx, { unit: e.target.value })}
                              >
                                {PRICE_UNITS.map((u) => (
                                  <option key={u} value={u}>
                                    {u}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <div className="t-two-fields">
                            <label>
                              Price £
                              <MoneyInput
                                pence={row.unitPricePence}
                                onPence={(unitPricePence) => update(idx, { unitPricePence })}
                              />
                            </label>
                            <label>
                              VAT %
                              <NumberInput
                                value={row.vatRate}
                                onValue={(vatRate) => update(idx, { vatRate })}
                                decimals={0}
                                max={100}
                              />
                            </label>
                          </div>
                          <label>
                            What it costs me £
                            <MoneyInput
                              pence={row.costPricePence ?? 0}
                              onPence={(costPricePence) => update(idx, { costPricePence })}
                            />
                            <span className="t-field-hint">
                              {marginLabel(row.unitPricePence, row.costPricePence) ??
                                "Optional. Fill it in and every job using this rate shows what you made."}
                            </span>
                          </label>
                          <label>
                            Category
                            <select
                              value={categoryOf(row)}
                              onChange={(e) => update(idx, { category: e.target.value })}
                            >
                              {RATE_CATEGORIES.map((rc) => (
                                <option key={rc.id} value={rc.id}>
                                  {rc.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="t-rate-item-checks">
                            <label>
                              <input
                                type="checkbox"
                                checked={row.isCallout}
                                onChange={(e) => update(idx, { isCallout: e.target.checked })}
                              />
                              Call-out
                            </label>
                            <label>
                              <input
                                type="checkbox"
                                checked={row.active}
                                onChange={(e) => update(idx, { active: e.target.checked })}
                              />
                              Active
                            </label>
                            {row.id ? (
                              <button
                                type="button"
                                className="linkish"
                                disabled={deactivate.isPending}
                                onClick={() => {
                                  if (
                                    confirm(
                                      "Deactivate this rate? Historic quotes keep the old link."
                                    )
                                  ) {
                                    deactivate.mutate(row.id!);
                                  }
                                }}
                              >
                                Deactivate
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="linkish"
                                onClick={() => {
                                  setDirty(true);
                                  setEditing(null);
                                  setRows((prev) => prev.filter((_, j) => j !== idx));
                                }}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {items.length === 0 && (
                  <p className="muted-text t-rate-empty">Nothing in {c.label} yet.</p>
                )}

                <button type="button" className="linkish t-rate-add" onClick={() => addBlankTo(c.id)}>
                  + Add to {c.label}
                </button>
              </div>
            )}
          </section>
        );
      })}

      {!list.isLoading && matching.length === 0 && needle && (
        <p className="muted-text">No rates match &ldquo;{search}&rdquo;.</p>
      )}

      {dirty && (
        <div className="t-rates-save">
          <button
            type="button"
            className="primary t-btn--block"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}

      {offline && (
        <p className="t-needs-signal">
          Edits are saved on your phone and sync when you&apos;re back in range. Excel import needs
          signal.
        </p>
      )}
    </div>
  );
}

/** Whole-book save. Queued offline, so the tradie's edits survive a dead spot. */
async function saveRows(items: PriceBookRow[]): Promise<PriceBookRow[]> {
  const r = await sendOrQueue<PriceBookRow[]>({
    label: "Rates update",
    path: "/price-book",
    method: "PUT",
    body: { items },
    invalidates: ["tradie-price-book"],
  });
  // Queued — hand back what they typed so the screen keeps showing their edits
  // until the server's version comes back.
  return r.queued ? items : r.result;
}
