import type { Job, JobCost, Prisma } from "@prisma/client";
import { prisma } from "../../db.js";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Job profit.
 *
 * Three rules hold this together, and breaking any of them produces a number a
 * tradie would act on and lose money by:
 *
 *  1. Everything is ex-VAT. VAT isn't the tradie's money. Margin computed on
 *     VAT-inclusive totals overstates every single job.
 *  2. Cost of null means "not set", not zero. An unpriced material must never
 *     read as pure profit — the figure is marked provisional instead.
 *  3. A cost you swallowed is still a cost. Non-billable lines reduce profit;
 *     only revenue cares about `billable`.
 *
 * This is job *gross* profit — no van, insurance, phone or tax. Subtracting
 * overheads would make it bookkeeping, which has to be right or it's dangerous.
 * The UI calls it "Job profit" for that reason, never "Profit".
 */

export type JobProfit = {
  revenuePence: number;
  materialsPence: number;
  labourPence: number;
  expensesPence: number;
  profitPence: number;
  /** Null when there's no revenue to take a percentage of. */
  marginPct: number | null;
  /** True when at least one cost is unset, so the figure can't be trusted yet. */
  provisional: boolean;
  missingCostCount: number;
};

type CostLine = Pick<
  JobCost,
  "type" | "qty" | "unit" | "unitCostPence" | "sellPricePence" | "billable" | "isExtra"
>;

function lineCost(line: CostLine, labourRatePence: number | null): number | null {
  if (line.unitCostPence !== null) return Math.round(line.unitCostPence * line.qty);
  if (line.type === "LABOUR") {
    // Own time with no rate set costs nothing — the honest answer for a sole
    // trader, who doesn't invoice himself. Once someone else is on the van, the
    // rate is set in Settings and the same arithmetic keeps working.
    if (line.unit !== "HOUR" || labourRatePence === null) return 0;
    return Math.round(labourRatePence * line.qty);
  }
  return null; // materials / expenses with no cost recorded: genuinely unknown
}

export function computeProfit(
  job: Pick<Job, "quoteId" | "quotedTotalPence">,
  costs: CostLine[],
  labourRatePence: number | null
): JobProfit {
  let materials = 0;
  let labour = 0;
  let expenses = 0;
  let extrasRevenue = 0;
  let tmRevenue = 0;
  let missing = 0;

  for (const line of costs) {
    const cost = lineCost(line, labourRatePence);
    if (cost === null) missing += 1;
    const amount = cost ?? 0;

    switch (line.type) {
      case "MATERIAL":
      case "SUBCONTRACTOR":
        materials += amount;
        break;
      case "LABOUR":
        labour += amount;
        break;
      case "EXPENSE":
        expenses += amount;
        break;
    }

    if (line.billable) {
      const sell = Math.round(line.sellPricePence * line.qty);
      tmRevenue += sell;
      if (line.isExtra) extrasRevenue += sell;
    }
  }

  // A quoted job's non-extra lines are already inside the accepted total —
  // adding their sell prices again would double-count the whole job.
  const revenue = job.quoteId ? job.quotedTotalPence + extrasRevenue : tmRevenue;

  const profit = revenue - materials - labour - expenses;

  return {
    revenuePence: revenue,
    materialsPence: materials,
    labourPence: labour,
    expensesPence: expenses,
    profitPence: profit,
    marginPct: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null,
    provisional: missing > 0,
    missingCostCount: missing,
  };
}

export async function getJobCosts(clientId: string, jobId: string) {
  return prisma.jobCost.findMany({
    where: { clientId, jobId },
    orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
    include: { receiptFile: { select: { id: true, filename: true, url: true } } },
  });
}

/**
 * Seed a new job's costs from the quote it came from.
 *
 * This is what makes the Costs tab honest without any typing: if the tradie never
 * opens it, the profit is still right. A tab that only works once someone does
 * admin is a tab that shows the wrong number.
 */
export async function seedCostsFromQuote(
  db: Db,
  input: { clientId: string; jobId: string; quoteId: string; vatInclusive: boolean }
): Promise<number> {
  const lines = await db.quoteLine.findMany({
    where: { quoteId: input.quoteId },
    orderBy: { sort: "asc" },
  });
  if (!lines.length) return 0;

  await db.jobCost.createMany({
    data: lines.map((line, i) => ({
      clientId: input.clientId,
      jobId: input.jobId,
      // The price book's categories don't map perfectly, so infer from the unit:
      // time is labour, everything else is a material until told otherwise.
      type: line.unit === "HOUR" || line.unit === "DAY" ? ("LABOUR" as const) : ("MATERIAL" as const),
      label: line.label,
      qty: line.qty,
      unit: line.unit,
      unitCostPence: line.costPricePence,
      // Quote lines carry gross prices when the quote is VAT-inclusive; job costs
      // are always net. Storing them raw would quietly inflate revenue by the VAT
      // rate on every extra and every time-and-materials job.
      sellPricePence: netOf(line.unitPricePence, line.vatRate, input.vatInclusive),
      vatRate: line.vatRate,
      billable: true,
      priceBookItemId: line.priceBookItemId,
      source: "QUOTE",
      sort: i,
    })),
  });

  return lines.length;
}

/** Strip VAT from a price that may or may not include it. */
export function netOf(pence: number, vatRate: number, vatInclusive: boolean): number {
  if (!vatInclusive) return pence;
  return Math.round(pence / (1 + vatRate / 100));
}
