import * as XLSX from "xlsx";

export const PRICE_UNITS = ["EACH", "HOUR", "DAY", "JOB", "METRE"] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

export interface PriceBookRow {
  id?: string;
  sku: string | null;
  label: string;
  unit: string;
  unitPricePence: number;
  vatRate: number;
  isCallout: boolean;
  active: boolean;
}

export interface PriceBookImportRow {
  sku?: string | null;
  label: string;
  unit?: string;
  unitPriceGbp?: number;
  vatRate?: number;
  isCallout?: boolean;
  active?: boolean;
}

export const TEMPLATE_HEADERS = ["sku", "label", "unit", "price_gbp", "vat_pct", "callout", "active"] as const;

export const TEMPLATE_SAMPLE: PriceBookImportRow[] = [
  {
    sku: "CALL",
    label: "Call-out / first hour",
    unit: "JOB",
    unitPriceGbp: 85,
    vatRate: 20,
    isCallout: true,
    active: true,
  },
  {
    sku: "LAB_HR",
    label: "Labour (additional hour)",
    unit: "HOUR",
    unitPriceGbp: 55,
    vatRate: 20,
    isCallout: false,
    active: true,
  },
];

function truthy(v: unknown): boolean {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y";
}

function headerKey(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") return row[k];
  }
  return undefined;
}

export function rowsFromSheet(data: ArrayBuffer | string): PriceBookImportRow[] {
  const wb =
    typeof data === "string"
      ? XLSX.read(data, { type: "string" })
      : XLSX.read(data, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return json
    .map((raw): PriceBookImportRow | null => {
      const row: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) row[headerKey(k)] = v;
      const label = String(pick(row, "label", "name", "description") ?? "").trim();
      if (!label) return null;
      const priceRaw = Number(pick(row, "price_gbp", "price", "unit_price", "unit_price_gbp") ?? 0);
      const skuVal = pick(row, "sku", "code");
      return {
        sku: skuVal != null ? String(skuVal).trim() || null : null,
        label,
        unit: String(pick(row, "unit") ?? "JOB"),
        unitPriceGbp: Number.isFinite(priceRaw) ? priceRaw : 0,
        vatRate: Number(pick(row, "vat_pct", "vat", "vat_rate") ?? 20),
        isCallout: truthy(pick(row, "callout", "is_callout")),
        active: (() => {
          const a = pick(row, "active");
          if (a === undefined) return true;
          return truthy(a);
        })(),
      };
    })
    .filter((r): r is PriceBookImportRow => r != null);
}

export async function parsePriceBookFile(file: File): Promise<PriceBookImportRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type.includes("csv") || file.type.includes("text")) {
    const text = await file.text();
    return rowsFromSheet(text);
  }
  const buf = await file.arrayBuffer();
  return rowsFromSheet(buf);
}

function toSheetRows(items: PriceBookRow[] | PriceBookImportRow[]) {
  return items.map((i) => {
    const priceGbp =
      "unitPricePence" in i && typeof i.unitPricePence === "number"
        ? i.unitPricePence / 100
        : Number((i as PriceBookImportRow).unitPriceGbp ?? 0);
    return {
      sku: i.sku ?? "",
      label: i.label,
      unit: i.unit || "JOB",
      price_gbp: priceGbp,
      vat_pct: i.vatRate ?? 20,
      callout: i.isCallout ? "yes" : "no",
      active: i.active === false ? "no" : "yes",
    };
  });
}

function downloadWorkbook(rows: Record<string, unknown>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ sku: "", label: "", unit: "JOB", price_gbp: 0, vat_pct: 20, callout: "no", active: "yes" }], {
    header: [...TEMPLATE_HEADERS],
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Price book");
  XLSX.writeFile(wb, filename);
}

export function downloadPriceBookTemplate() {
  downloadWorkbook(toSheetRows(TEMPLATE_SAMPLE), "tradersmate-pricebook-template.xlsx");
}

export function exportPriceBook(items: PriceBookRow[], filename = "pricebook.xlsx") {
  downloadWorkbook(toSheetRows(items), filename);
}
