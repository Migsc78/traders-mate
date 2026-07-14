import type { PriceUnit } from "@prisma/client";
import { prisma } from "../../db.js";

export interface SeedItem {
  sku: string;
  label: string;
  tradeTag: string;
  unit: PriceUnit;
  unitPricePence: number;
  isCallout?: boolean;
}

const PLUMBER: SeedItem[] = [
  { sku: "CALL", label: "Call-out / first hour", tradeTag: "plumber", unit: "JOB", unitPricePence: 8500, isCallout: true },
  { sku: "LAB_HR", label: "Labour (additional hour)", tradeTag: "plumber", unit: "HOUR", unitPricePence: 5500 },
  { sku: "COMBI_SWAP", label: "Combi boiler swap (labour only)", tradeTag: "plumber", unit: "JOB", unitPricePence: 65000 },
  { sku: "RAD_SWAP", label: "Radiator swap", tradeTag: "plumber", unit: "EACH", unitPricePence: 12000 },
  { sku: "TAP_FIT", label: "Tap fit / replace", tradeTag: "plumber", unit: "EACH", unitPricePence: 7500 },
  { sku: "TOILET", label: "Toilet replace", tradeTag: "plumber", unit: "JOB", unitPricePence: 18000 },
];

const ELECTRICIAN: SeedItem[] = [
  { sku: "CALL", label: "Call-out / first hour", tradeTag: "electrician", unit: "JOB", unitPricePence: 9000, isCallout: true },
  { sku: "LAB_HR", label: "Labour (additional hour)", tradeTag: "electrician", unit: "HOUR", unitPricePence: 6000 },
  { sku: "CU_UPG", label: "Consumer unit upgrade (labour)", tradeTag: "electrician", unit: "JOB", unitPricePence: 45000 },
  { sku: "SOCKET", label: "Additional socket", tradeTag: "electrician", unit: "EACH", unitPricePence: 8500 },
  { sku: "EICR", label: "EICR (up to 10 circuits)", tradeTag: "electrician", unit: "JOB", unitPricePence: 18000 },
  { sku: "LIGHT", label: "Light fitting install", tradeTag: "electrician", unit: "EACH", unitPricePence: 6500 },
];

const HEATING: SeedItem[] = [
  { sku: "CALL", label: "Call-out / first hour", tradeTag: "heating", unit: "JOB", unitPricePence: 8500, isCallout: true },
  { sku: "LAB_HR", label: "Labour (additional hour)", tradeTag: "heating", unit: "HOUR", unitPricePence: 5500 },
  { sku: "SERVICE", label: "Boiler service", tradeTag: "heating", unit: "JOB", unitPricePence: 9500 },
  { sku: "COMBI_SWAP", label: "Combi boiler swap (labour only)", tradeTag: "heating", unit: "JOB", unitPricePence: 65000 },
  { sku: "TRV", label: "TRV fit", tradeTag: "heating", unit: "EACH", unitPricePence: 4500 },
  { sku: "POWERFLUSH", label: "Powerflush", tradeTag: "heating", unit: "JOB", unitPricePence: 35000 },
];

function templateForTrade(tradeTitle: string | null | undefined): SeedItem[] {
  const t = (tradeTitle || "").toLowerCase();
  if (/electr|spark/.test(t)) return ELECTRICIAN;
  if (/heat|gas|boiler/.test(t)) return HEATING;
  if (/plumb/.test(t)) return PLUMBER;
  // Default mixed starter — plumber-leaning for general trades
  return PLUMBER;
}

/** Seed price book once if empty. Safe to call repeatedly. */
export async function ensurePriceBook(clientId: string, tradeTitle?: string | null): Promise<number> {
  const count = await prisma.priceBookItem.count({ where: { clientId } });
  if (count > 0) return 0;
  const client = tradeTitle
    ? { tradeTitle }
    : await prisma.client.findUnique({ where: { id: clientId }, select: { tradeTitle: true } });
  const items = templateForTrade(client?.tradeTitle);
  await prisma.priceBookItem.createMany({
    data: items.map((i) => ({
      clientId,
      sku: i.sku,
      label: i.label,
      tradeTag: i.tradeTag,
      unit: i.unit,
      unitPricePence: i.unitPricePence,
      isCallout: i.isCallout ?? false,
      vatRate: 20,
      active: true,
    })),
  });
  return items.length;
}

export function matchPriceBook(
  items: { id: string; sku: string | null; label: string; unit: PriceUnit; unitPricePence: number; vatRate: number; isCallout: boolean }[],
  hint: { label: string; skuHint?: string; unit?: string }
) {
  const sku = hint.skuHint?.trim().toUpperCase();
  if (sku) {
    const bySku = items.find((i) => i.sku?.toUpperCase() === sku);
    if (bySku) return bySku;
  }
  const needle = hint.label.toLowerCase();
  const exact = items.find((i) => i.label.toLowerCase() === needle);
  if (exact) return exact;
  const partial = items.find(
    (i) => needle.includes(i.label.toLowerCase()) || i.label.toLowerCase().includes(needle.split(/\s+/)[0] || "")
  );
  return partial ?? null;
}

const UNITS = new Set<PriceUnit>(["EACH", "HOUR", "DAY", "JOB", "METRE"]);

export function parsePriceUnit(raw: string | undefined | null): PriceUnit {
  const u = String(raw || "JOB").trim().toUpperCase() as PriceUnit;
  return UNITS.has(u) ? u : "JOB";
}

export function gbpToPence(gbp: number): number {
  if (!Number.isFinite(gbp) || gbp < 0) return 0;
  return Math.round(gbp * 100);
}

export interface PriceBookUpsertRow {
  sku?: string | null;
  label: string;
  unit?: string;
  unitPriceGbp?: number;
  unitPricePence?: number;
  vatRate?: number;
  isCallout?: boolean;
  active?: boolean;
}

export interface UpsertPriceBookResult {
  created: number;
  updated: number;
  skipped: number;
  items: Awaited<ReturnType<typeof listPriceBook>>;
}

export async function listPriceBook(clientId: string) {
  await ensurePriceBook(clientId);
  return prisma.priceBookItem.findMany({
    where: { clientId },
    orderBy: [{ active: "desc" }, { label: "asc" }],
  });
}

/** Soft-deactivate so historic quotes keep their priceBookItemId. */
export async function deactivatePriceBookItem(clientId: string, id: string) {
  const row = await prisma.priceBookItem.findFirst({ where: { id, clientId } });
  if (!row) return null;
  return prisma.priceBookItem.update({
    where: { id },
    data: { active: false },
  });
}

/**
 * Upsert rows from Excel/CSV import.
 * Match by sku (case-insensitive) when present; otherwise always create.
 */
export async function upsertPriceBookRows(
  clientId: string,
  rows: PriceBookUpsertRow[]
): Promise<UpsertPriceBookResult> {
  await ensurePriceBook(clientId);
  const existing = await prisma.priceBookItem.findMany({ where: { clientId } });
  const bySku = new Map(
    existing
      .filter((e) => e.sku)
      .map((e) => [e.sku!.trim().toUpperCase(), e] as const)
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const label = String(row.label || "").trim();
    if (!label) {
      skipped += 1;
      continue;
    }
    const unit = parsePriceUnit(row.unit);
    const unitPricePence =
      row.unitPricePence != null
        ? Math.max(0, Math.round(Number(row.unitPricePence) || 0))
        : gbpToPence(Number(row.unitPriceGbp ?? 0));
    const vatRate = Math.min(100, Math.max(0, Number(row.vatRate ?? 20)));
    const isCallout = Boolean(row.isCallout);
    const active = row.active !== false;
    const skuRaw = row.sku != null ? String(row.sku).trim() : "";
    const sku = skuRaw || null;
    const skuKey = sku?.toUpperCase();

    const match = skuKey ? bySku.get(skuKey) : undefined;
    if (match) {
      const updatedRow = await prisma.priceBookItem.update({
        where: { id: match.id },
        data: { sku, label, unit, unitPricePence, vatRate, isCallout, active },
      });
      bySku.set(skuKey!, updatedRow);
      updated += 1;
    } else {
      const createdRow = await prisma.priceBookItem.create({
        data: {
          clientId,
          sku,
          label,
          unit,
          unitPricePence,
          vatRate,
          isCallout,
          active,
        },
      });
      if (skuKey) bySku.set(skuKey, createdRow);
      created += 1;
    }
  }

  return { created, updated, skipped, items: await listPriceBook(clientId) };
}

export async function savePriceBookItems(
  clientId: string,
  items: {
    id?: string;
    sku?: string | null;
    label: string;
    unit: PriceUnit;
    unitPricePence: number;
    vatRate: number;
    isCallout?: boolean;
    active?: boolean;
  }[]
) {
  const saved = [];
  for (const item of items) {
    if (item.id) {
      const owned = await prisma.priceBookItem.findFirst({ where: { id: item.id, clientId } });
      if (!owned) continue;
      saved.push(
        await prisma.priceBookItem.update({
          where: { id: item.id },
          data: {
            sku: item.sku ?? null,
            label: item.label,
            unit: item.unit,
            unitPricePence: item.unitPricePence,
            vatRate: item.vatRate,
            isCallout: item.isCallout ?? false,
            active: item.active ?? true,
          },
        })
      );
    } else {
      saved.push(
        await prisma.priceBookItem.create({
          data: {
            clientId,
            sku: item.sku ?? null,
            label: item.label,
            unit: item.unit,
            unitPricePence: item.unitPricePence,
            vatRate: item.vatRate,
            isCallout: item.isCallout ?? false,
            active: item.active ?? true,
          },
        })
      );
    }
  }
  return saved;
}

/** Include shape for quote lines so the UI can show price-book provenance. */
export const quoteLineInclude = {
  orderBy: { sort: "asc" as const },
  include: {
    priceBookItem: { select: { id: true, sku: true, label: true } },
  },
};
