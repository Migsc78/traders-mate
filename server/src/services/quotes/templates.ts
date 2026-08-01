import { prisma } from "../../db.js";

/**
 * Starter job templates, seeded per trade.
 *
 * The point of a template is that repeat work shouldn't need AI or typing — a
 * boiler swap is the same eighteen lines every time. Prices here are deliberate
 * placeholders: they're overwritten from the tradie's own price book wherever a
 * label matches, so seeding never quietly invents rates they'd actually charge.
 */

type SeedItem = {
  label: string;
  qty?: number;
  unit?: string;
  unitPricePence: number;
  isAddOn?: boolean;
};

type SeedTemplate = {
  name: string;
  category: string;
  description?: string;
  items: SeedItem[];
};

const HEATING: SeedTemplate[] = [
  {
    name: "Boiler service",
    category: "Heating",
    description: "Annual service and safety check",
    items: [
      { label: "Boiler service & safety check", unitPricePence: 9000 },
      { label: "Flue gas analysis", unitPricePence: 0 },
      { label: "Condensate trap clean", unitPricePence: 0 },
      { label: "Magnetic filter clean", unitPricePence: 2500, isAddOn: true },
      { label: "Gas safety certificate", unitPricePence: 3500, isAddOn: true },
    ],
  },
  {
    name: "Boiler installation",
    category: "Heating",
    description: "Combi swap including flue and controls",
    items: [
      { label: "Combi boiler (up to 30kW)", unitPricePence: 98000 },
      { label: "Standard flue kit", unitPricePence: 9000 },
      { label: "Magnetic filter", unitPricePence: 8000 },
      { label: "Power flush", unitPricePence: 35000 },
      { label: "Chemical inhibitor", unitPricePence: 2500 },
      { label: "Removal & disposal of old boiler", unitPricePence: 6000 },
      { label: "Labour", qty: 2, unit: "DAY", unitPricePence: 27500 },
      { label: "Smart thermostat", unitPricePence: 15000, isAddOn: true },
      { label: "Extended warranty (10 yr)", unitPricePence: 20000, isAddOn: true },
      { label: "System filter upgrade", unitPricePence: 12000, isAddOn: true },
    ],
  },
  {
    name: "Radiator replacement",
    category: "Heating",
    items: [
      { label: "Radiator (double panel)", unitPricePence: 12000 },
      { label: "Thermostatic valve set", unitPricePence: 4500 },
      { label: "Labour", qty: 3, unit: "HOUR", unitPricePence: 5500 },
      { label: "Balance & bleed system", unitPricePence: 0, isAddOn: true },
    ],
  },
];

const PLUMBING: SeedTemplate[] = [
  {
    name: "General plumbing call-out",
    category: "Plumbing",
    items: [
      { label: "Call-out (first hour)", unitPricePence: 8500 },
      { label: "Additional labour", qty: 1, unit: "HOUR", unitPricePence: 5500 },
      { label: "Sundries & fittings", unitPricePence: 1500 },
    ],
  },
  {
    name: "Shower replacement",
    category: "Bathrooms",
    items: [
      { label: "Mixer shower unit", unitPricePence: 22000 },
      { label: "Shower valve", unitPricePence: 8500 },
      { label: "Silicone & sundries", unitPricePence: 1500 },
      { label: "Labour", qty: 4, unit: "HOUR", unitPricePence: 5500 },
      { label: "Remove & dispose old unit", unitPricePence: 3000 },
      { label: "Thermostatic upgrade", unitPricePence: 9000, isAddOn: true },
      { label: "Tile repair", unitPricePence: 6500, isAddOn: true },
    ],
  },
  {
    name: "Bathroom installation",
    category: "Bathrooms",
    description: "Full suite fit including tiling allowance",
    items: [
      { label: "Bath & panel", unitPricePence: 38000 },
      { label: "Basin & pedestal", unitPricePence: 18000 },
      { label: "WC & cistern", unitPricePence: 22000 },
      { label: "Taps & waste set", unitPricePence: 14000 },
      { label: "Shower over bath", unitPricePence: 25000 },
      { label: "Tiling allowance", unitPricePence: 45000 },
      { label: "Waterproofing & sundries", unitPricePence: 8000 },
      { label: "Strip out & disposal", unitPricePence: 20000 },
      { label: "Labour", qty: 5, unit: "DAY", unitPricePence: 27500 },
      { label: "Underfloor heating mat", unitPricePence: 48000, isAddOn: true },
      { label: "Heated towel rail", unitPricePence: 16000, isAddOn: true },
      { label: "Extractor fan upgrade", unitPricePence: 12000, isAddOn: true },
    ],
  },
];

const ELECTRICAL: SeedTemplate[] = [
  {
    name: "Consumer unit replacement",
    category: "Electrical",
    items: [
      { label: "Consumer unit (10 way, RCBO)", unitPricePence: 32000 },
      { label: "Main earth & bonding upgrade", unitPricePence: 12000 },
      { label: "Labour", qty: 1, unit: "DAY", unitPricePence: 28000 },
      { label: "Electrical Installation Certificate", unitPricePence: 0 },
      { label: "Surge protection device", unitPricePence: 9000, isAddOn: true },
    ],
  },
  {
    name: "EICR inspection",
    category: "Electrical",
    items: [
      { label: "EICR (up to 10 circuits)", unitPricePence: 18000 },
      { label: "Report & certificate", unitPricePence: 0 },
      { label: "Additional circuits", qty: 1, unit: "EACH", unitPricePence: 1500, isAddOn: true },
    ],
  },
  {
    name: "EV charger installation",
    category: "Electrical",
    items: [
      { label: "7kW EV charge point", unitPricePence: 65000 },
      { label: "Cabling & containment (up to 10m)", unitPricePence: 12000 },
      { label: "Isolator & protection", unitPricePence: 8000 },
      { label: "Labour", qty: 1, unit: "DAY", unitPricePence: 28000 },
      { label: "Additional cable run", qty: 1, unit: "METRE", unitPricePence: 1200, isAddOn: true },
    ],
  },
];

function templatesForTrade(tradeTitle: string | null | undefined): SeedTemplate[] {
  const t = (tradeTitle || "").toLowerCase();
  if (/electr|spark/.test(t)) return ELECTRICAL;
  if (/heat|gas|boiler/.test(t)) return [...HEATING, ...PLUMBING.slice(0, 1)];
  if (/plumb/.test(t)) return [...PLUMBING, ...HEATING.slice(0, 2)];
  // Mixed starter for general trades — same default as the price book.
  return [...PLUMBING, ...HEATING.slice(0, 2)];
}

/**
 * Seed starter templates once, if the tradie has none. Safe to call repeatedly.
 *
 * Prices are pulled from the client's own price book where a label matches, so a
 * tradie who has already set their rates sees those, not our placeholders.
 */
export async function ensureQuoteTemplates(
  clientId: string,
  tradeTitle?: string | null
): Promise<number> {
  const existing = await prisma.quoteTemplate.count({ where: { clientId } });
  if (existing > 0) return 0;

  const client = tradeTitle
    ? { tradeTitle }
    : await prisma.client.findUnique({ where: { id: clientId }, select: { tradeTitle: true } });

  const book = await prisma.priceBookItem.findMany({
    where: { clientId, active: true },
    select: { id: true, label: true, unitPricePence: true, unit: true, vatRate: true },
  });
  const byLabel = new Map(book.map((b) => [b.label.trim().toLowerCase(), b]));

  const seeds = templatesForTrade(client?.tradeTitle);
  for (const seed of seeds) {
    await prisma.quoteTemplate.create({
      data: {
        clientId,
        name: seed.name,
        category: seed.category,
        description: seed.description ?? null,
        items: {
          create: seed.items.map((item, index) => {
            const match = byLabel.get(item.label.trim().toLowerCase());
            return {
              label: item.label,
              qty: item.qty ?? 1,
              unit: item.unit ?? match?.unit ?? "JOB",
              // The tradie's own rate wins over our placeholder.
              unitPricePence: match?.unitPricePence ?? item.unitPricePence,
              vatRate: match?.vatRate ?? 20,
              isAddOn: item.isAddOn ?? false,
              sortOrder: index,
              priceBookItemId: match?.id ?? null,
            };
          }),
        },
      },
    });
  }
  return seeds.length;
}
