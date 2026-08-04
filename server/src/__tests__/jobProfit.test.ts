/**
 * Run: npx tsx src/__tests__/jobProfit.test.ts
 *
 * Job profit is the one number in the app a tradie would change his business
 * over — which jobs to take, what to charge. A margin that's quietly wrong is
 * worse than no margin at all, so the arithmetic is pinned down here rather
 * than trusted to a glance over the UI.
 *
 * The three rules under test:
 *   1. Everything is ex-VAT. VAT is not the tradie's money.
 *   2. A null cost means "not set", never zero — the figure goes provisional.
 *   3. A cost you swallowed still reduces profit; only revenue reads `billable`.
 */
import { computeProfit, netOf } from "../services/jobs/costs.js";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) {
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, actual === expected, `expected ${expected}, got ${actual}`);
}

type Line = Parameters<typeof computeProfit>[1][number];

const material = (sell: number, cost: number | null, qty = 1): Line => ({
  type: "MATERIAL",
  qty,
  unit: "EACH",
  unitCostPence: cost,
  sellPricePence: sell,
  billable: true,
  isExtra: false,
});

const labour = (hours: number, cost: number | null = null): Line => ({
  type: "LABOUR",
  qty: hours,
  unit: "HOUR",
  unitCostPence: cost,
  sellPricePence: 4000,
  billable: true,
  isExtra: false,
});

const quoted = { quoteId: "q1", quotedTotalPence: 203400 };
const direct = { quoteId: null, quotedTotalPence: 0 };

/* ------------------------------------------------- a quoted job, nothing typed */
{
  // Boiler at £1,450 sell / £980 cost, magnetic filter at £85 / £52, 4 hours own
  // labour. This is the state a job arrives in straight from an accepted quote.
  const p = computeProfit(quoted, [material(145000, 98000), material(8500, 5200), labour(4)], null);

  eq("quoted revenue is the accepted total", p.revenuePence, 203400);
  eq("materials sum at cost", p.materialsPence, 103200);
  eq("own labour with no rate set costs nothing", p.labourPence, 0);
  eq("profit", p.profitPence, 203400 - 103200);
  eq("margin", p.marginPct, 49.3);
  check("not provisional — every cost known", p.provisional === false);
}

/* --------------------------------------------- the sole trader / employee split */
{
  const lines = [material(145000, 98000), labour(4)];
  const sole = computeProfit(quoted, lines, null);
  const employed = computeProfit(quoted, lines, 2200); // £22/hr on the van

  eq("sole trader: own time is not a cash cost", sole.labourPence, 0);
  eq("with a rate set, 4 hours costs £88", employed.labourPence, 8800);
  eq("and profit drops by exactly that", sole.profitPence - employed.profitPence, 8800);
}

/* ------------------------------------------------------- unpriced material */
{
  const p = computeProfit(quoted, [material(145000, null), material(8500, 5200)], null);

  eq("unpriced line counted", p.missingCostCount, 1);
  check("figure marked provisional", p.provisional === true);
  eq("known costs still subtracted", p.materialsPence, 5200);
  // The danger this guards: treating null as 0 would report £1,982 profit on a
  // boiler that cost £980, and the tradie would price the next one off it.
  check("does not silently claim the unpriced item as profit", p.provisional);
}

/* ---------------------------------------------- zero is a real cost, not a gap */
{
  const p = computeProfit(quoted, [material(145000, 0)], null);
  eq("a genuinely free part is not 'missing'", p.missingCostCount, 0);
  check("so the figure stands", p.provisional === false);
}

/* ------------------------------------------------------------ extras on a quote */
{
  const extra: Line = {
    type: "MATERIAL",
    qty: 1,
    unit: "EACH",
    unitCostPence: 4000,
    sellPricePence: 8000,
    billable: true,
    isExtra: true,
  };
  // The quote's own lines must not be added to the accepted total again.
  const p = computeProfit(quoted, [material(145000, 98000), extra], null);

  eq("revenue is baseline plus the extra only", p.revenuePence, 203400 + 8000);
  eq("extra's cost counted too", p.materialsPence, 98000 + 4000);
}

/* --------------------------------------------- time and materials, no quote */
{
  const p = computeProfit(direct, [material(9500, 4200), labour(1.5)], null);
  eq("revenue is what was recorded", p.revenuePence, 9500 + 6000);
  eq("profit", p.profitPence, 9500 + 6000 - 4200);
}

/* ------------------------------------------------- swallowed cost still bites */
{
  const goodwill: Line = { ...material(0, 3500), billable: false };
  const p = computeProfit(direct, [material(9500, 4200), goodwill], null);

  eq("non-billable adds nothing to revenue", p.revenuePence, 9500);
  eq("but its cost comes off profit", p.materialsPence, 4200 + 3500);
  eq("profit", p.profitPence, 9500 - 7700);
}

/* ------------------------------------------------------------ quantities */
{
  const p = computeProfit(direct, [material(1200, 700, 8)], null);
  eq("sell scales with qty", p.revenuePence, 9600);
  eq("cost scales with qty", p.materialsPence, 5600);
}

/* ------------------------------------------------------------ edge cases */
{
  const p = computeProfit(direct, [], null);
  eq("no revenue means no percentage to report", p.marginPct, null);
  eq("and no profit", p.profitPence, 0);

  const loss = computeProfit(direct, [material(5000, 8000)], null);
  eq("a job run at a loss reports it", loss.profitPence, -3000);
  eq("negative margin", loss.marginPct, -60);
}

/* ------------------------------------------------------------------- VAT */
{
  eq("VAT-inclusive £120 at 20% is £100 net", netOf(12000, 20, true), 10000);
  eq("VAT-exclusive price is left alone", netOf(10000, 20, false), 10000);
  eq("zero-rated", netOf(10000, 0, true), 10000);
  // The bug this prevents: seeding sell prices straight off a VAT-inclusive
  // quote would inflate revenue by 20% on every extra and every T&M job.
  eq("5% reduced rate", netOf(10500, 5, true), 10000);
}

if (failures) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("OK: job profit (24 assertions)");
