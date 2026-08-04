import type { PrismaClient } from "@prisma/client";

/**
 * Jobs for the demo account, covering both paths in the PRD and every tab of
 * the pipeline.
 *
 * Deliberately includes work sitting in **To invoice**: that tab is the whole
 * argument for splitting operational and commercial status, and a demo where
 * it's empty demonstrates nothing.
 *
 * Cost prices are set on the demo client's rates only. A brand-new account's
 * starter rates stay blank on purpose — inventing what a tradie pays for a
 * boiler would be a worse lie than leaving it unset, and "cost not set" is a
 * true statement on day one.
 */

type Ids = {
  demoClientId: string;
  enquiryIds: { alice: string; bob: string; cara: string; dan: string };
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function at(daysFromNow: number, hour: number): Date {
  const d = new Date(Date.now() + daysFromNow * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function ago(days: number): Date {
  return new Date(Date.now() - days * DAY);
}

export async function seedJobs(prisma: PrismaClient, ids: Ids): Promise<void> {
  const clientId = ids.demoClientId;

  const bob = await prisma.customer.findFirst({ where: { clientId, name: "Bob Seed" } });
  const residence = await prisma.property.findFirst({
    where: { clientId, nickname: "The Seed Residence" },
  });
  const riverside = await prisma.property.findFirst({
    where: { clientId, nickname: "Riverside Flat" },
  });

  /* ---------------------------------------- cost prices on the demo rate card */

  const rateCosts: Record<string, number> = {
    CALL: 0, // a call-out costs the tradie time, not cash
    LAB_HR: 0,
    SERVICE: 1200, // consumables on a boiler service
    COMBI_SWAP: 0,
    TRV: 1450,
    POWERFLUSH: 4200,
    RAD_SWAP: 5500,
    TAP_FIT: 2800,
    TOILET: 8500,
  };
  for (const [sku, cost] of Object.entries(rateCosts)) {
    await prisma.priceBookItem.updateMany({
      where: { clientId, sku },
      data: { costPricePence: cost },
    });
  }

  /* ------------------------------------------------- 1. quoted work, unbilled

     The headline case. Accepted quote with a deposit already paid, work done
     yesterday, an extra agreed on site — and no invoice raised. This is the job
     that makes "To invoice" mean something. */

  // A real accepted quote behind it, because "quoted work" is one of the two
  // paths the product supports and a job carrying a quoted total with no quote
  // attached would bill as time-and-materials — demonstrating the wrong path.
  const boilerQuote = await prisma.quote.create({
    data: {
      clientId,
      enquiryId: ids.enquiryIds.bob,
      status: "ACCEPTED",
      vatInclusive: true,
      subtotalPence: 197500,
      vatPence: 39500,
      totalPence: 237000,
      depositPercent: 25,
      depositPence: 50000,
      depositPaidAt: ago(9),
      publicToken: "seedtok_quote_boiler_j1042",
      reference: "Q-1042",
      customerNote: "Supply and fit Worcester Greenstar 30i combi, including magnetic filter and flush.",
      sentAt: ago(12),
      decidedAt: ago(10),
      lines: {
        create: [
          // Gross, because the quote is VAT-inclusive — the job's cost lines are
          // net, and the invoice builder reconciles the two.
          { sort: 0, label: "Worcester Greenstar 30i", qty: 1, unit: "EACH", unitPricePence: 174000, costPricePence: 98000, vatRate: 20 },
          { sort: 1, label: "Magnetic system filter", qty: 1, unit: "EACH", unitPricePence: 10200, costPricePence: 5200, vatRate: 20 },
          { sort: 2, label: "Installation", qty: 8, unit: "HOUR", unitPricePence: 6600, costPricePence: 0, vatRate: 20 },
        ],
      },
    },
  });

  const boilerJob = await prisma.job.create({
    data: {
      clientId,
      quoteId: boilerQuote.id,
      enquiryId: ids.enquiryIds.bob,
      customerId: bob?.id ?? null,
      propertyId: residence?.id ?? null,
      reference: "J-1042",
      title: "Boiler replacement — Worcester Greenstar 30i",
      scope:
        "Remove existing Potterton, fit Worcester Greenstar 30i combi in the utility cupboard. " +
        "Magnetic filter, chemical flush, 10-year warranty registration.",
      operational: "COMPLETED",
      commercial: "READY_TO_INVOICE",
      quotedTotalPence: 197500,
      depositPaidPence: 50000,
      startedAt: ago(1),
      completedAt: ago(1),
    },
  });

  await prisma.jobCost.createMany({
    data: [
      {
        clientId,
        jobId: boilerJob.id,
        type: "MATERIAL",
        label: "Worcester Greenstar 30i",
        qty: 1,
        unit: "EACH",
        unitCostPence: 98000,
        sellPricePence: 145000,
        source: "QUOTE",
        sort: 0,
      },
      {
        clientId,
        jobId: boilerJob.id,
        type: "MATERIAL",
        label: "Magnetic system filter",
        qty: 1,
        unit: "EACH",
        unitCostPence: 5200,
        sellPricePence: 8500,
        source: "QUOTE",
        sort: 1,
      },
      {
        clientId,
        jobId: boilerJob.id,
        type: "LABOUR",
        label: "Installation",
        qty: 8,
        unit: "HOUR",
        // Own time. Null would read as "not recorded"; this is a deliberate zero.
        unitCostPence: 0,
        sellPricePence: 5500,
        source: "QUOTE",
        sort: 2,
      },
      {
        clientId,
        jobId: boilerJob.id,
        type: "MATERIAL",
        label: "Replace corroded gas cock",
        qty: 1,
        unit: "EACH",
        unitCostPence: 1800,
        sellPricePence: 4500,
        isExtra: true,
        agreedAt: ago(1),
        agreedVia: "in person",
        source: "MANUAL",
        sort: 3,
      },
      {
        clientId,
        jobId: boilerJob.id,
        type: "EXPENSE",
        label: "Congestion charge",
        qty: 1,
        unit: "JOB",
        unitCostPence: 1500,
        sellPricePence: 0,
        // Swallowed. Still comes off the profit — that's the point of the flag.
        billable: false,
        source: "MANUAL",
        sort: 4,
      },
    ],
  });

  await prisma.appointment.create({
    data: {
      clientId,
      jobId: boilerJob.id,
      title: boilerJob.title,
      kind: "Install",
      startsAt: at(-1, 8),
      endsAt: at(-1, 16),
      arrivalWindowStart: at(-1, 8),
      arrivalWindowEnd: at(-1, 10),
      status: "DONE",
      completedAt: ago(1),
      customerName: "Bob Seed",
      address: "GU22 8CC",
    },
  });

  await prisma.jobEvent.createMany({
    data: [
      { clientId, jobId: boilerJob.id, type: "job.created", summary: "Job created from quote Q-1042", createdAt: ago(9) },
      { clientId, jobId: boilerJob.id, type: "job.scheduled", summary: "Visit scheduled", createdAt: ago(8) },
      { clientId, jobId: boilerJob.id, type: "visit.on_my_way", summary: "On the way", createdAt: new Date(Date.now() - DAY - 9 * HOUR) },
      { clientId, jobId: boilerJob.id, type: "job.started", summary: "Work started", createdAt: new Date(Date.now() - DAY - 8 * HOUR) },
      { clientId, jobId: boilerJob.id, type: "cost.extra_agreed", summary: "Extra agreed: Replace corroded gas cock", createdAt: new Date(Date.now() - DAY - 6 * HOUR) },
      { clientId, jobId: boilerJob.id, type: "job.completed", summary: "Job completed", createdAt: ago(1) },
    ],
  });

  await prisma.customerNote.create({
    data: {
      clientId,
      jobId: boilerJob.id,
      customerId: bob?.id ?? null,
      propertyId: residence?.id ?? null,
      type: "JOB",
      body:
        "Old Potterton out, Greenstar in and commissioned. Flushed the system, fitted the filter. " +
        "Gas cock was seized — replaced with customer's agreement. Benchmark filled in, left with Bob.",
    },
  });

  /* --------------------------------------------- 2. direct booked, paid

     The call-out path: no quote at all, billed from what was recorded on site. */

  const leakJob = await prisma.job.create({
    data: {
      clientId,
      enquiryId: ids.enquiryIds.cara,
      customerId: bob?.id ?? null,
      propertyId: riverside?.id ?? null,
      reference: "J-1039",
      title: "Burst pipe under kitchen sink",
      scope: "Emergency call-out. 15mm feed to the mixer split at the compression joint.",
      operational: "COMPLETED",
      commercial: "PAID",
      startedAt: ago(6),
      completedAt: ago(6),
    },
  });

  await prisma.jobCost.createMany({
    data: [
      {
        clientId,
        jobId: leakJob.id,
        type: "LABOUR",
        label: "Emergency call-out / first hour",
        qty: 1,
        unit: "JOB",
        unitCostPence: 0,
        sellPricePence: 7083,
        invoicedAt: ago(6),
        source: "BOOK",
        sort: 0,
      },
      {
        clientId,
        jobId: leakJob.id,
        type: "MATERIAL",
        label: "15mm compression coupler",
        qty: 2,
        unit: "EACH",
        unitCostPence: 280,
        sellPricePence: 650,
        invoicedAt: ago(6),
        source: "MANUAL",
        sort: 1,
      },
    ],
  });

  await prisma.jobEvent.createMany({
    data: [
      { clientId, jobId: leakJob.id, type: "job.created", summary: "Job booked directly", createdAt: ago(6) },
      { clientId, jobId: leakJob.id, type: "job.completed", summary: "Job completed", createdAt: ago(6) },
      { clientId, jobId: leakJob.id, type: "invoice.created", summary: "Draft invoice INV-1039 for 100.60", createdAt: ago(6) },
      { clientId, jobId: leakJob.id, type: "invoice.paid", summary: "Invoice INV-1039 paid", createdAt: ago(4) },
    ],
  });

  /* --------------------------------------------------------- 3. upcoming */

  const serviceJob = await prisma.job.create({
    data: {
      clientId,
      enquiryId: ids.enquiryIds.alice,
      customerId: bob?.id ?? null,
      propertyId: residence?.id ?? null,
      reference: "J-1045",
      title: "Annual boiler service",
      scope: "Yearly service and gas safety check on the Greenstar 30i.",
      operational: "SCHEDULED",
      commercial: "UNQUOTED",
    },
  });

  await prisma.appointment.create({
    data: {
      clientId,
      jobId: serviceJob.id,
      title: serviceJob.title,
      kind: "Service",
      startsAt: at(1, 9),
      endsAt: at(1, 11),
      arrivalWindowStart: at(1, 9),
      arrivalWindowEnd: at(1, 11),
      status: "SCHEDULED",
      customerName: "Bob Seed",
      address: "GU22 8CC",
      notes: "Dog is friendly but shut in the back room — ring first.",
    },
  });

  await prisma.jobEvent.createMany({
    data: [
      { clientId, jobId: serviceJob.id, type: "job.created", summary: "Job booked directly", createdAt: ago(2) },
      { clientId, jobId: serviceJob.id, type: "job.scheduled", summary: "Visit scheduled", createdAt: ago(2) },
    ],
  });

  /* ------------------------------------------------------- 4. in progress */

  const bathroomJob = await prisma.job.create({
    data: {
      clientId,
      enquiryId: ids.enquiryIds.dan,
      customerId: bob?.id ?? null,
      propertyId: riverside?.id ?? null,
      reference: "J-1044",
      title: "Bathroom refit — second fix",
      scope: "Second fix: basin, WC, shower valve and towel rail. Tiling done by others.",
      operational: "IN_PROGRESS",
      commercial: "QUOTED",
      quotedTotalPence: 306667,
      startedAt: new Date(Date.now() - 3 * HOUR),
    },
  });

  await prisma.jobCost.createMany({
    data: [
      {
        clientId,
        jobId: bathroomJob.id,
        type: "MATERIAL",
        label: "Thermostatic shower valve",
        qty: 1,
        unit: "EACH",
        unitCostPence: 14500,
        sellPricePence: 24000,
        source: "QUOTE",
        sort: 0,
      },
      {
        clientId,
        jobId: bathroomJob.id,
        type: "MATERIAL",
        label: "Chrome towel rail 1200x500",
        qty: 1,
        unit: "EACH",
        // Left unrecorded on purpose: this is what makes the demo show a
        // provisional figure rather than a suspiciously tidy one.
        unitCostPence: null,
        sellPricePence: 18000,
        source: "QUOTE",
        sort: 1,
      },
      {
        clientId,
        jobId: bathroomJob.id,
        type: "LABOUR",
        label: "Second fix",
        qty: 12,
        unit: "HOUR",
        unitCostPence: 0,
        sellPricePence: 5500,
        source: "QUOTE",
        sort: 2,
      },
    ],
  });

  await prisma.appointment.createMany({
    data: [
      {
        clientId,
        jobId: bathroomJob.id,
        title: "Bathroom refit — first fix",
        kind: "First fix",
        startsAt: at(-4, 8),
        endsAt: at(-4, 16),
        status: "DONE",
        completedAt: ago(4),
        customerName: "Bob Seed",
        address: "GU1 4AB",
      },
      {
        clientId,
        jobId: bathroomJob.id,
        title: "Bathroom refit — second fix",
        kind: "Second fix",
        startsAt: at(0, 8),
        endsAt: at(0, 17),
        arrivalWindowStart: at(0, 8),
        arrivalWindowEnd: at(0, 10),
        status: "ON_THE_WAY",
        customerName: "Bob Seed",
        address: "GU1 4AB",
      },
    ],
  });

  await prisma.jobEvent.createMany({
    data: [
      { clientId, jobId: bathroomJob.id, type: "job.created", summary: "Job created from quote Q-1041", createdAt: ago(11) },
      { clientId, jobId: bathroomJob.id, type: "job.scheduled", summary: "Two visits scheduled", createdAt: ago(10) },
      { clientId, jobId: bathroomJob.id, type: "job.started", summary: "Work started", createdAt: new Date(Date.now() - 3 * HOUR) },
    ],
  });

  /* ----------------------------------------------------- 5. to schedule */

  const rewireJob = await prisma.job.create({
    data: {
      clientId,
      customerId: bob?.id ?? null,
      reference: "J-1046",
      title: "Outside tap — frost damage",
      scope: "Outside tap split over the winter. Replace and fit an isolator inside.",
      operational: "UNSCHEDULED",
      commercial: "UNQUOTED",
    },
  });

  await prisma.jobEvent.create({
    data: { clientId, jobId: rewireJob.id, type: "job.created", summary: "Promoted from inbox", createdAt: ago(1) },
  });

  console.log(
    "  Jobs: 1 to schedule, 1 upcoming, 1 in progress, 1 to invoice, 1 done"
  );
}
