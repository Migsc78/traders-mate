import { prisma } from "../../db.js";
import { resolveTradePreset, type TradePresetId } from "../quotes/priceBook.js";

/**
 * Starter asset types per UK trade.
 *
 * An asset, here, is a thing installed at a property that the tradie comes back
 * to — because it needs servicing, certifying, or because a warranty runs on it.
 * That definition is what earns the register its keep: a boiler with a next-due
 * date is next year's work already booked.
 *
 * Service intervals below follow the common UK positions:
 *  - Gas appliances and unvented cylinders: annual (HSE / G3).
 *  - Domestic EICR: 10 years owner-occupied, 5 years tenanted — the shorter
 *    figure is used, because the tradie can push a date out but won't invent one.
 *  - Fire alarm and emergency lighting: annual, per BS 5839-1 / BS 5266-1.
 * These are defaults a tradie can change per asset, not compliance advice.
 */

export type AssetTypeSeed = {
  label: string;
  group: "HEATING" | "WATER" | "ELECTRICAL" | "RENEWABLE" | "FABRIC" | "OTHER";
  defaultServiceMonths?: number;
};

const PLUMBING_HEATING: AssetTypeSeed[] = [
  { label: "Combi boiler", group: "HEATING", defaultServiceMonths: 12 },
  { label: "System boiler", group: "HEATING", defaultServiceMonths: 12 },
  { label: "Regular (heat only) boiler", group: "HEATING", defaultServiceMonths: 12 },
  { label: "Oil boiler", group: "HEATING", defaultServiceMonths: 12 },
  { label: "LPG boiler", group: "HEATING", defaultServiceMonths: 12 },
  { label: "Back boiler", group: "HEATING", defaultServiceMonths: 12 },
  { label: "Gas fire", group: "HEATING", defaultServiceMonths: 12 },
  { label: "Gas cooker / hob", group: "HEATING", defaultServiceMonths: 12 },
  { label: "Flue / chimney", group: "HEATING", defaultServiceMonths: 12 },
  { label: "Unvented cylinder", group: "WATER", defaultServiceMonths: 12 },
  { label: "Vented hot water cylinder", group: "WATER", defaultServiceMonths: 24 },
  { label: "Thermal store", group: "WATER", defaultServiceMonths: 12 },
  { label: "Water heater (instantaneous)", group: "WATER", defaultServiceMonths: 12 },
  { label: "Expansion vessel", group: "WATER", defaultServiceMonths: 12 },
  { label: "Water softener", group: "WATER", defaultServiceMonths: 12 },
  { label: "Booster pump", group: "WATER", defaultServiceMonths: 12 },
  { label: "Macerator / pumped waste", group: "WATER", defaultServiceMonths: 12 },
  { label: "Thermostat / programmer", group: "HEATING" },
  { label: "Radiator", group: "HEATING" },
  { label: "Underfloor heating manifold", group: "HEATING", defaultServiceMonths: 24 },
  { label: "Mixer shower", group: "WATER" },
  { label: "Electric shower", group: "WATER" },
  { label: "Bathroom suite", group: "WATER" },
  { label: "Stopcock / mains supply", group: "WATER" },
];

const ELECTRICAL: AssetTypeSeed[] = [
  { label: "Consumer unit / fuse board", group: "ELECTRICAL", defaultServiceMonths: 60 },
  { label: "Distribution board (sub-main)", group: "ELECTRICAL", defaultServiceMonths: 60 },
  { label: "Earthing & bonding", group: "ELECTRICAL", defaultServiceMonths: 60 },
  { label: "EV charge point", group: "ELECTRICAL", defaultServiceMonths: 12 },
  { label: "Electric shower", group: "ELECTRICAL" },
  { label: "Immersion heater", group: "ELECTRICAL", defaultServiceMonths: 24 },
  { label: "Storage heater", group: "ELECTRICAL", defaultServiceMonths: 24 },
  { label: "Extractor fan", group: "ELECTRICAL", defaultServiceMonths: 24 },
  { label: "Smoke / heat alarm system", group: "ELECTRICAL", defaultServiceMonths: 12 },
  { label: "Fire alarm panel", group: "ELECTRICAL", defaultServiceMonths: 12 },
  { label: "Emergency lighting", group: "ELECTRICAL", defaultServiceMonths: 12 },
  { label: "Lighting circuit", group: "ELECTRICAL" },
  { label: "Socket circuit / ring final", group: "ELECTRICAL" },
  { label: "Outbuilding supply", group: "ELECTRICAL", defaultServiceMonths: 60 },
  { label: "CCTV / door entry", group: "ELECTRICAL", defaultServiceMonths: 12 },
  { label: "Solar PV array", group: "RENEWABLE", defaultServiceMonths: 12 },
  { label: "Solar inverter", group: "RENEWABLE", defaultServiceMonths: 12 },
  { label: "Battery storage", group: "RENEWABLE", defaultServiceMonths: 12 },
];

const RENEWABLES: AssetTypeSeed[] = [
  { label: "Air source heat pump", group: "RENEWABLE", defaultServiceMonths: 12 },
  { label: "Ground source heat pump", group: "RENEWABLE", defaultServiceMonths: 12 },
  { label: "MVHR unit", group: "RENEWABLE", defaultServiceMonths: 12 },
];

/**
 * Building-fabric trades — plastering, painting, roofing, carpentry.
 *
 * Worth being straight about: these trades mostly don't *service* anything, so
 * the asset register does less for them than it does for a gas engineer. What it
 * still buys them is warranty and "when did we last do this" — a repaint cycle,
 * a roof with ten years left on it. Their repeat work comes off the property
 * record and reminders more than off assets.
 */
const FABRIC: AssetTypeSeed[] = [
  { label: "Roof covering", group: "FABRIC" },
  { label: "Flat roof", group: "FABRIC", defaultServiceMonths: 60 },
  { label: "Guttering & downpipes", group: "FABRIC", defaultServiceMonths: 12 },
  { label: "Fascias & soffits", group: "FABRIC" },
  { label: "External render", group: "FABRIC" },
  { label: "Internal plasterwork", group: "FABRIC" },
  { label: "Exterior paintwork", group: "FABRIC", defaultServiceMonths: 60 },
  { label: "Windows", group: "FABRIC" },
  { label: "External doors", group: "FABRIC" },
  { label: "Damp proof course", group: "FABRIC" },
  { label: "Driveway / patio", group: "FABRIC" },
  { label: "Fencing / decking", group: "FABRIC", defaultServiceMonths: 24 },
];

const GENERAL_TAIL: AssetTypeSeed[] = [{ label: "Other", group: "OTHER" }];

const BY_TRADE: Record<TradePresetId, AssetTypeSeed[]> = {
  plumber: [...PLUMBING_HEATING, ...FABRIC.slice(0, 2), ...GENERAL_TAIL],
  heating: [...PLUMBING_HEATING, ...RENEWABLES, ...GENERAL_TAIL],
  electrician: [...ELECTRICAL, ...GENERAL_TAIL],
};

/** What a trade starts with, before the tradie adds their own. */
export function starterAssetTypes(tradeTitle: string | null | undefined): AssetTypeSeed[] {
  const t = (tradeTitle || "").toLowerCase();
  // Fabric trades don't map onto the price-book presets, which only know the
  // three service trades — so they're matched directly rather than defaulting to
  // a plumber's list of boilers they'll never touch.
  if (/plaster|paint|decorat|roof|carpent|joiner|builder|render|brick/.test(t)) {
    return [...FABRIC, ...GENERAL_TAIL];
  }
  return BY_TRADE[resolveTradePreset(tradeTitle)];
}

/**
 * Seed the catalogue once per account. Safe to call repeatedly — mirrors
 * ensurePriceBook, and for the same reason: a tradie who opens Assets for the
 * first time should find a usable list, not an empty screen and a text box.
 */
export async function ensureAssetTypes(clientId: string): Promise<number> {
  const count = await prisma.assetType.count({ where: { clientId } });
  if (count > 0) return 0;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { tradeTitle: true },
  });
  const seeds = starterAssetTypes(client?.tradeTitle);

  await prisma.assetType.createMany({
    data: seeds.map((s, i) => ({
      clientId,
      label: s.label,
      group: s.group,
      defaultServiceMonths: s.defaultServiceMonths ?? null,
      sort: i,
    })),
    skipDuplicates: true,
  });
  return seeds.length;
}

export async function listAssetTypes(clientId: string) {
  await ensureAssetTypes(clientId);
  return prisma.assetType.findMany({
    where: { clientId },
    orderBy: [{ active: "desc" }, { sort: "asc" }, { label: "asc" }],
  });
}

/**
 * Add a type the tradie typed in themselves.
 *
 * Case-insensitive match on the label so "EV Charger" typed twice doesn't become
 * two entries — and if they'd previously hidden it, adding it back turns it on
 * rather than failing on the unique constraint.
 */
export async function upsertAssetType(
  clientId: string,
  input: { label: string; group?: string; defaultServiceMonths?: number | null }
) {
  const label = input.label.trim();
  if (!label) throw new Error("Asset type needs a name");

  const existing = await prisma.assetType.findFirst({
    where: { clientId, label: { equals: label, mode: "insensitive" } },
  });
  if (existing) {
    return prisma.assetType.update({
      where: { id: existing.id },
      data: {
        active: true,
        group: input.group ?? existing.group,
        defaultServiceMonths:
          input.defaultServiceMonths === undefined
            ? existing.defaultServiceMonths
            : input.defaultServiceMonths,
      },
    });
  }

  const last = await prisma.assetType.findFirst({
    where: { clientId },
    orderBy: { sort: "desc" },
    select: { sort: true },
  });

  return prisma.assetType.create({
    data: {
      clientId,
      label,
      group: input.group ?? "OTHER",
      defaultServiceMonths: input.defaultServiceMonths ?? null,
      sort: (last?.sort ?? 0) + 1,
    },
  });
}

/** Hide a seeded type without touching assets already filed under it. */
export async function setAssetTypeActive(clientId: string, id: string, active: boolean) {
  const owned = await prisma.assetType.findFirst({ where: { id, clientId } });
  if (!owned) return null;
  return prisma.assetType.update({ where: { id }, data: { active } });
}
