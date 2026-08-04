import type { PriceUnit } from "@prisma/client";
import { prisma } from "../../db.js";

/** Groups the price book on the Rates screen. Free text so adding one later needs no migration. */
export const PRICE_BOOK_CATEGORIES = ["SERVICE", "MATERIAL", "LABOUR", "CALLOUT", "OTHER"] as const;
export type PriceBookCategory = (typeof PRICE_BOOK_CATEGORIES)[number];

export interface SeedItem {
  sku: string;
  label: string;
  tradeTag: string;
  category: PriceBookCategory;
  unit: PriceUnit;
  unitPricePence: number;
  isCallout?: boolean;
}

const PLUMBER: SeedItem[] = [
  { sku: "CALL", label: "Call-out / first hour", tradeTag: "plumber", category: "CALLOUT", unit: "JOB", unitPricePence: 8500, isCallout: true },
  { sku: "LAB_HR", label: "Labour (additional hour)", tradeTag: "plumber", category: "LABOUR", unit: "HOUR", unitPricePence: 5500 },
  { sku: "COMBI_SWAP", label: "Combi boiler swap (labour only)", tradeTag: "plumber", category: "SERVICE", unit: "JOB", unitPricePence: 65000 },
  { sku: "RAD_SWAP", label: "Radiator swap", tradeTag: "plumber", category: "SERVICE", unit: "EACH", unitPricePence: 12000 },
  { sku: "TAP_FIT", label: "Tap fit / replace", tradeTag: "plumber", category: "SERVICE", unit: "EACH", unitPricePence: 7500 },
  { sku: "TOILET", label: "Toilet replace", tradeTag: "plumber", category: "SERVICE", unit: "JOB", unitPricePence: 18000 },
];

const ELECTRICIAN: SeedItem[] = [
  { sku: "CALL", label: "Call-out / first hour", tradeTag: "electrician", category: "CALLOUT", unit: "JOB", unitPricePence: 9000, isCallout: true },
  { sku: "LAB_HR", label: "Labour (additional hour)", tradeTag: "electrician", category: "LABOUR", unit: "HOUR", unitPricePence: 6000 },
  { sku: "CU_UPG", label: "Consumer unit upgrade (labour)", tradeTag: "electrician", category: "SERVICE", unit: "JOB", unitPricePence: 45000 },
  { sku: "SOCKET", label: "Additional socket", tradeTag: "electrician", category: "SERVICE", unit: "EACH", unitPricePence: 8500 },
  { sku: "EICR", label: "EICR (up to 10 circuits)", tradeTag: "electrician", category: "SERVICE", unit: "JOB", unitPricePence: 18000 },
  { sku: "LIGHT", label: "Light fitting install", tradeTag: "electrician", category: "SERVICE", unit: "EACH", unitPricePence: 6500 },
];

const HEATING: SeedItem[] = [
  { sku: "CALL", label: "Call-out / first hour", tradeTag: "heating", category: "CALLOUT", unit: "JOB", unitPricePence: 8500, isCallout: true },
  { sku: "LAB_HR", label: "Labour (additional hour)", tradeTag: "heating", category: "LABOUR", unit: "HOUR", unitPricePence: 5500 },
  { sku: "SERVICE", label: "Boiler service", tradeTag: "heating", category: "SERVICE", unit: "JOB", unitPricePence: 9500 },
  { sku: "COMBI_SWAP", label: "Combi boiler swap (labour only)", tradeTag: "heating", category: "SERVICE", unit: "JOB", unitPricePence: 65000 },
  { sku: "TRV", label: "TRV fit", tradeTag: "heating", category: "SERVICE", unit: "EACH", unitPricePence: 4500 },
  { sku: "POWERFLUSH", label: "Powerflush", tradeTag: "heating", category: "SERVICE", unit: "JOB", unitPricePence: 35000 },
];

export const TRADE_PRESETS = [
  { id: "plumber", label: "Plumber", tradeTitle: "Plumber" },
  { id: "electrician", label: "Electrician", tradeTitle: "Electrician" },
  { id: "heating", label: "Heating / gas", tradeTitle: "Heating engineer" },
] as const;

export type TradePresetId = (typeof TRADE_PRESETS)[number]["id"];

export function resolveTradePreset(tradeTitle: string | null | undefined): TradePresetId {
  const t = (tradeTitle || "").toLowerCase();
  if (/electr|spark/.test(t)) return "electrician";
  if (/heat|gas|boiler/.test(t)) return "heating";
  return "plumber";
}

export function tradeTitleForPreset(preset: TradePresetId): string {
  return TRADE_PRESETS.find((p) => p.id === preset)?.tradeTitle ?? "Plumber";
}

function templateForTrade(tradeTitle: string | null | undefined): SeedItem[] {
  const t = (tradeTitle || "").toLowerCase();
  if (/electr|spark/.test(t)) return ELECTRICIAN;
  if (/heat|gas|boiler/.test(t)) return HEATING;
  if (/plumb/.test(t)) return PLUMBER;
  // Default mixed starter — plumber-leaning for general trades
  return PLUMBER;
}

/** Preview starter rates for a trade (does not write to DB). */
export function previewRatesForTrade(tradeTitle: string | null | undefined) {
  return templateForTrade(tradeTitle).map((i) => ({
    sku: i.sku,
    label: i.label,
    unit: i.unit,
    unitPricePence: i.unitPricePence,
    isCallout: i.isCallout ?? false,
  }));
}

/** Seed price book once if empty. Safe to call repeatedly. Pass replace to wipe and reseed. */
export async function ensurePriceBook(
  clientId: string,
  tradeTitle?: string | null,
  opts?: { replace?: boolean }
): Promise<number> {
  if (opts?.replace) {
    await prisma.priceBookItem.deleteMany({ where: { clientId } });
  } else {
    const count = await prisma.priceBookItem.count({ where: { clientId } });
    if (count > 0) return 0;
  }
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
      category: i.category,
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
  category?: string | null;
  unit?: string;
  unitPriceGbp?: number;
  unitPricePence?: number;
  costPriceGbp?: number;
  costPricePence?: number;
  vatRate?: number;
  isCallout?: boolean;
  active?: boolean;
}

/** Anything unrecognised lands in Other rather than being dropped. */
export function parsePriceBookCategory(raw: unknown): PriceBookCategory | null {
  if (raw == null || raw === "") return null;
  const c = String(raw).trim().toUpperCase() as PriceBookCategory;
  return PRICE_BOOK_CATEGORIES.includes(c) ? c : "OTHER";
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
    // A sheet with no cost column leaves existing costs alone rather than
    // blanking a book the tradie may have spent an evening filling in.
    const cost =
      row.costPricePence != null
        ? Math.max(0, Math.round(Number(row.costPricePence) || 0))
        : row.costPriceGbp != null
          ? gbpToPence(Number(row.costPriceGbp))
          : undefined;
    const isCallout = Boolean(row.isCallout);
    const active = row.active !== false;
    const skuRaw = row.sku != null ? String(row.sku).trim() : "";
    const sku = skuRaw || null;
    const skuKey = sku?.toUpperCase();
    // A spreadsheet with no category column shouldn't blank the ones already set,
    // so only touch the field when the sheet actually carried a value.
    const category = parsePriceBookCategory(row.category);
    const categoryPatch = category ? { category } : {};

    const match = skuKey ? bySku.get(skuKey) : undefined;
    if (match) {
      const updatedRow = await prisma.priceBookItem.update({
        where: { id: match.id },
        data: { sku, label, unit, unitPricePence, vatRate, isCallout, active, ...categoryPatch, ...costPatch(cost) },
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
          category: category ?? (isCallout ? "CALLOUT" : "OTHER"),
          ...costPatch(cost),
        },
      });
      if (skuKey) bySku.set(skuKey, createdRow);
      created += 1;
    }
  }

  return { created, updated, skipped, items: await listPriceBook(clientId) };
}

export interface PriceBookItemInput {
  id?: string;
  sku?: string | null;
  label: string;
  category?: string | null;
  unit: PriceUnit;
  unitPricePence: number;
  /** What it costs the tradie, ex VAT. Absent leaves it alone; null clears it. */
  costPricePence?: number | null;
  vatRate: number;
  isCallout?: boolean;
  active?: boolean;
}

/** Same rule as category: an absent key must not wipe what's already stored. */
function costPatch(cost: number | null | undefined) {
  if (cost === undefined) return {};
  return { costPricePence: cost === null ? null : Math.max(0, Math.round(cost)) };
}

export async function savePriceBookItems(clientId: string, items: PriceBookItemInput[]) {
  const saved = [];
  for (const item of items) {
    /**
     * Older app builds don't send category at all. Writing `null` for them would
     * silently empty the tradie's categories every time they saved from a phone
     * that hadn't updated yet, so an absent key leaves the column alone.
     *
     * costPricePence is newer still and gets exactly the same treatment — a phone
     * on the previous build saving a rate must not erase the cost behind it.
     */
    const categoryPatch =
      item.category === undefined ? {} : { category: parsePriceBookCategory(item.category) };

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
            ...categoryPatch,
            ...costPatch(item.costPricePence),
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
            category: parsePriceBookCategory(item.category) ?? "OTHER",
            ...costPatch(item.costPricePence),
          },
        })
      );
    }
  }
  return saved;
}

/**
 * Create one rate from the "New rate item" flow.
 *
 * The phone mints the id so a rate added with no signal exists immediately and
 * keeps the same identity when the queued write lands. Upserting on that id means
 * a retry that got through the first time updates rather than creating a twin.
 */
export async function createPriceBookItem(clientId: string, item: PriceBookItemInput) {
  await ensurePriceBook(clientId);
  const data = {
    sku: item.sku?.trim() || null,
    label: item.label.trim(),
    unit: item.unit,
    unitPricePence: Math.max(0, Math.round(item.unitPricePence)),
    vatRate: item.vatRate,
    isCallout: item.isCallout ?? false,
    active: item.active ?? true,
    category: parsePriceBookCategory(item.category) ?? "OTHER",
    ...costPatch(item.costPricePence),
  };

  if (item.id) {
    const owned = await prisma.priceBookItem.findFirst({ where: { id: item.id, clientId } });
    if (owned) return prisma.priceBookItem.update({ where: { id: owned.id }, data });
    return prisma.priceBookItem.create({ data: { id: item.id, clientId, ...data } });
  }
  return prisma.priceBookItem.create({ data: { clientId, ...data } });
}

/**
 * Fill in price-book provenance and the cost snapshot for a set of quote lines.
 *
 * Two reasons this exists. The obvious one: job profit needs to know what each
 * line costs, and reading it through the price book later would give the price
 * as it is *now*, not as it was when the job was priced — which is the wrong
 * number the moment copper moves.
 *
 * The second is a bug it happens to fix. The quote editor saved lines with no
 * priceBookItemId at all, so a line typed as "Radiator swap" lost its link to
 * the rate it came from. Matching on label restores it.
 */
export async function attachCostPrices<
  T extends { label: string; unitPricePence: number; priceBookItemId?: string | null },
>(clientId: string, lines: T[]): Promise<(T & { priceBookItemId: string | null; costPricePence: number | null })[]> {
  const items = await prisma.priceBookItem.findMany({
    where: { clientId },
    select: { id: true, label: true, costPricePence: true },
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  const byLabel = new Map(items.map((i) => [i.label.trim().toLowerCase(), i]));

  return lines.map((line) => {
    const match =
      (line.priceBookItemId ? byId.get(line.priceBookItemId) : undefined) ??
      byLabel.get(line.label.trim().toLowerCase());
    return {
      ...line,
      priceBookItemId: match?.id ?? line.priceBookItemId ?? null,
      costPricePence: match?.costPricePence ?? null,
    };
  });
}

/** Include shape for quote lines so the UI can show price-book provenance. */
export const quoteLineInclude = {
  orderBy: { sort: "asc" as const },
  include: {
    priceBookItem: { select: { id: true, sku: true, label: true, costPricePence: true } },
  },
};
