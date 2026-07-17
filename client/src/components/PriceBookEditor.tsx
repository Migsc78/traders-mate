import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  downloadPriceBookTemplate,
  exportPriceBook,
  parsePriceBookFile,
  PRICE_UNITS,
  type PriceBookImportRow,
  type PriceBookRow,
} from "../lib/priceBookFile";

export type PriceBookApi = {
  list: () => Promise<PriceBookRow[]>;
  save: (items: PriceBookRow[]) => Promise<PriceBookRow[]>;
  importRows: (
    rows: PriceBookImportRow[]
  ) => Promise<{ created: number; updated: number; skipped: number; items: PriceBookRow[] }>;
  deactivate: (id: string) => Promise<PriceBookRow>;
};

function blankRow(): PriceBookRow {
  return {
    sku: "",
    label: "",
    unit: "JOB",
    unitPricePence: 0,
    vatRate: 20,
    isCallout: false,
    active: true,
  };
}

export default function PriceBookEditor({
  queryKey,
  api,
  title = "Price book",
  compact = false,
}: {
  queryKey: unknown[];
  api: PriceBookApi;
  title?: string;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PriceBookRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const list = useQuery({
    queryKey,
    queryFn: () => api.list(),
  });

  useEffect(() => {
    if (list.data && !dirty) {
      setRows(list.data.map((r: PriceBookRow) => ({ ...r, sku: r.sku ?? "" })));
    }
  }, [list.data, dirty]);

  const save = useMutation({
    mutationFn: () =>
      api.save(
        rows
          .filter((r) => r.label.trim())
          .map((r) => ({
            ...r,
            sku: r.sku?.trim() ? r.sku.trim() : null,
            label: r.label.trim(),
            unitPricePence: Math.max(0, Math.round(Number(r.unitPricePence) || 0)),
            vatRate: Number(r.vatRate) || 20,
          }))
      ),
    onSuccess: (saved: PriceBookRow[]) => {
      setDirty(false);
      setRows(saved.map((r: PriceBookRow) => ({ ...r, sku: r.sku ?? "" })));
      setNotice(`Saved ${saved.length} item${saved.length === 1 ? "" : "s"}.`);
      setError("");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => setError(e.message),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api.deactivate(id),
    onSuccess: () => {
      setDirty(false);
      setNotice("Item deactivated.");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => setError(e.message),
  });

  const doImport = useMutation({
    mutationFn: (importRows: PriceBookImportRow[]) => api.importRows(importRows),
    onSuccess: (r: { created: number; updated: number; skipped: number; items: PriceBookRow[] }) => {
      setDirty(false);
      setRows(r.items.map((i: PriceBookRow) => ({ ...i, sku: i.sku ?? "" })));
      setNotice(`Import done — ${r.created} created, ${r.updated} updated, ${r.skipped} skipped.`);
      setError("");
      qc.invalidateQueries({ queryKey });
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

  return (
    <div className={compact ? "pricebook pricebook-compact" : "pricebook"}>
      <div className="pricebook-head">
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <p className="muted-text" style={{ margin: "4px 0 0" }}>
            Rates used when drafting quotes from voice or notes. Seeded from your trade; edit freely.
          </p>
        </div>
        <div className="tradie-actions">
          <button type="button" onClick={() => downloadPriceBookTemplate()}>
            Template
          </button>
          <button type="button" onClick={() => exportPriceBook(rows)} disabled={!rows.length}>
            Export
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={doImport.isPending}>
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
      </div>

      {list.isLoading && <p>Loading…</p>}
      {list.isError && <p className="error">{(list.error as Error).message}</p>}
      {error && <p className="error">{error}</p>}
      {notice && <p className="muted-text">{notice}</p>}

      <div className="pricebook-mobile">
        {rows.map((r, i) => (
          <article key={r.id || `new-${i}`} className={`pricebook-card${r.active ? "" : " inactive"}`}>
            <label>
              Label
              <input value={r.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Label" />
            </label>
            <div className="pricebook-card-row">
              <label>
                SKU
                <input value={r.sku ?? ""} onChange={(e) => update(i, { sku: e.target.value })} placeholder="CALL" />
              </label>
              <label>
                Unit
                <select value={r.unit} onChange={(e) => update(i, { unit: e.target.value })}>
                  {PRICE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="pricebook-card-row">
              <label>
                Price £
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(r.unitPricePence / 100).toFixed(2)}
                  onChange={(e) => update(i, { unitPricePence: Math.round(Number(e.target.value) * 100) })}
                />
              </label>
              <label>
                VAT %
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={r.vatRate}
                  onChange={(e) => update(i, { vatRate: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="pricebook-card-checks">
              <label>
                <input
                  type="checkbox"
                  checked={r.isCallout}
                  onChange={(e) => update(i, { isCallout: e.target.checked })}
                />
                Call-out
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={r.active}
                  onChange={(e) => update(i, { active: e.target.checked })}
                />
                Active
              </label>
              {r.id ? (
                <button
                  type="button"
                  className="linkish"
                  disabled={deactivate.isPending}
                  onClick={() => {
                    if (confirm("Deactivate this rate? Historic quotes keep the old link.")) {
                      deactivate.mutate(r.id!);
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
                    setRows((prev) => prev.filter((_, j) => j !== i));
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      <div className="pricebook-table-wrap">
        <table className="pricebook-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Label</th>
              <th>Unit</th>
              <th>£</th>
              <th>VAT%</th>
              <th>Call-out</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || `new-${i}`} className={r.active ? undefined : "inactive"}>
                <td>
                  <input value={r.sku ?? ""} onChange={(e) => update(i, { sku: e.target.value })} placeholder="CALL" />
                </td>
                <td>
                  <input value={r.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Label" />
                </td>
                <td>
                  <select value={r.unit} onChange={(e) => update(i, { unit: e.target.value })}>
                    {PRICE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={(r.unitPricePence / 100).toFixed(2)}
                    onChange={(e) => update(i, { unitPricePence: Math.round(Number(e.target.value) * 100) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={r.vatRate}
                    onChange={(e) => update(i, { vatRate: Number(e.target.value) })}
                  />
                </td>
                <td className="center">
                  <input
                    type="checkbox"
                    checked={r.isCallout}
                    onChange={(e) => update(i, { isCallout: e.target.checked })}
                  />
                </td>
                <td className="center">
                  <input
                    type="checkbox"
                    checked={r.active}
                    onChange={(e) => update(i, { active: e.target.checked })}
                  />
                </td>
                <td>
                  {r.id ? (
                    <button
                      type="button"
                      className="linkish"
                      disabled={deactivate.isPending}
                      onClick={() => {
                        if (confirm("Deactivate this rate? Historic quotes keep the old link.")) {
                          deactivate.mutate(r.id!);
                        }
                      }}
                    >
                      Off
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => {
                        setDirty(true);
                        setRows((prev) => prev.filter((_, j) => j !== i));
                      }}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="tradie-actions">
        <button
          type="button"
          onClick={() => {
            setDirty(true);
            setRows((prev) => [...prev, blankRow()]);
          }}
        >
          + Add row
        </button>
        <button
          type="button"
          className="primary"
          disabled={save.isPending || !dirty}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Save price book"}
        </button>
      </div>
    </div>
  );
}
