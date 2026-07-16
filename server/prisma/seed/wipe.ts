/**
 * Delete ALL TradersMate seed data. Safe for launch — only rows matching seed markers.
 *
 *   npm run db:seed:wipe --prefix server
 */
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "./loadEnv.js";
import { SEED, SEED_PHONES } from "./markers.js";

loadEnv();

const prisma = new PrismaClient();

export async function wipeSeedData(): Promise<{
  clients: number;
  leads: number;
  searchRuns: number;
  otpOrphans: number;
}> {
  const seedClients = await prisma.client.findMany({
    where: {
      OR: [{ routeKey: { startsWith: SEED.ROUTE_PREFIX } }, { businessName: { startsWith: SEED.LABEL } }],
    },
    select: { id: true, routeKey: true, businessName: true },
  });
  const clientIds = seedClients.map((c) => c.id);

  // Explicit child deletes for tables that may not cascade from every path, then clients.
  if (clientIds.length) {
    await prisma.followUp.deleteMany({
      where: {
        OR: [{ quote: { clientId: { in: clientIds } } }, { invoice: { clientId: { in: clientIds } } }],
      },
    });
    await prisma.invoiceLine.deleteMany({ where: { invoice: { clientId: { in: clientIds } } } });
    await prisma.quoteLine.deleteMany({ where: { quote: { clientId: { in: clientIds } } } });
    await prisma.invoice.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.quote.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.message.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.missedCall.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.voiceNote.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.priceBookItem.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.clientAsset.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.clientSession.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.otpChallenge.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.enquiry.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
  }

  // Quotes/invoices with seed tokens but no client match (shouldn't happen)
  await prisma.invoice.deleteMany({ where: { publicToken: { startsWith: SEED.TOKEN_PREFIX } } });
  await prisma.quote.deleteMany({ where: { publicToken: { startsWith: SEED.TOKEN_PREFIX } } });

  const leads = await prisma.lead.deleteMany({
    where: {
      OR: [
        { placeId: { startsWith: SEED.PLACE_PREFIX } },
        { displayName: { startsWith: SEED.LABEL } },
        { notes: { startsWith: SEED.LABEL } },
      ],
    },
  });

  const searchRuns = await prisma.searchRun.deleteMany({
    where: {
      OR: [{ occupation: { startsWith: SEED.SEARCH_MARK } }, { town: { startsWith: SEED.SEARCH_MARK } }],
    },
  });

  const seedPhoneList = Object.values(SEED_PHONES);
  const otpOrphans = await prisma.otpChallenge.deleteMany({
    where: { phone: { in: seedPhoneList } },
  });

  return {
    clients: seedClients.length,
    leads: leads.count,
    searchRuns: searchRuns.count,
    otpOrphans: otpOrphans.count,
  };
}

async function main() {
  console.log("Wiping TradersMate seed data (marker-matched only)…");
  const result = await wipeSeedData();
  console.log("Wipe complete:", result);
  console.log("Real customer data was not touched.");
}

const invokedDirectly = /wipe\.(ts|js)$/.test(process.argv[1]?.replace(/\\/g, "/") ?? "");
if (invokedDirectly) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
