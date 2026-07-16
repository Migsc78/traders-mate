/**
 * Seed comprehensive test data for every CRM + tradie screen.
 * Idempotent: wipes previous seed rows first, then inserts.
 *
 *   npm run db:seed --prefix server
 */
import { createHash } from "node:crypto";
import {
  PrismaClient,
  WebsiteClass,
  WebsiteCheck,
  BizStatus,
  OutreachStatus,
  DomainState,
  ClientStatus,
  Channel,
  EnquiryStatus,
  QuoteStatus,
  InvoiceStatus,
  MessageDirection,
  MessageChannel,
  MissedCallStatus,
  VoiceNoteStatus,
  FollowUpKind,
  FollowUpStatus,
  PriceUnit,
  ClientAssetKind,
} from "@prisma/client";
import { loadEnv } from "./loadEnv.js";
import { SEED, SEED_PHONES, SEED_ROUTE_KEYS } from "./markers.js";
import { wipeSeedData } from "./wipe.js";

loadEnv();

const prisma = new PrismaClient();

function hashToken(raw: string): string {
  const secret = process.env.MAGIC_LINK_SECRET || "dev-magic-link-secret-change-me";
  return createHash("sha256").update(`${secret}:${raw}`).digest("hex");
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function main() {
  console.log("Wiping previous seed data…");
  console.log(await wipeSeedData());

  console.log("Seeding SearchRun + Leads (CRM Search / Leads)…");
  const searchRun = await prisma.searchRun.create({
    data: {
      occupation: `${SEED.SEARCH_MARK} plumber`,
      town: `${SEED.SEARCH_MARK} Woking`,
      centerLat: 51.3169,
      centerLng: -0.56,
      radiusM: 8000,
      resultCount: 5,
      newCount: 5,
    },
  });

  const leadSpecs: Array<{
    suffix: string;
    displayName: string;
    occupation: string;
    town: string;
    websiteClass: WebsiteClass;
    websiteCheck: WebsiteCheck;
    outreachStatus: OutreachStatus;
    qualified: boolean;
    disqualifiedReason?: string;
    priorityScore: number;
    phone?: string;
    websiteUri?: string;
    domainSuggested?: string;
    domainAvailable?: DomainState;
  }> = [
    {
      suffix: "none_mobile",
      displayName: `${SEED.LABEL} Apex Boiler Care`,
      occupation: "plumber",
      town: "Woking",
      websiteClass: "NONE",
      websiteCheck: "SKIPPED",
      outreachStatus: "NEW",
      qualified: true,
      priorityScore: 92,
      phone: "07700900111",
      domainSuggested: "apexboilercare.co.uk",
      domainAvailable: "AVAILABLE",
    },
    {
      suffix: "social",
      displayName: `${SEED.LABEL} Guildford Gas Bros`,
      occupation: "gas engineer",
      town: "Guildford",
      websiteClass: "SOCIAL_ONLY",
      websiteCheck: "OK",
      outreachStatus: "CONTACTED",
      qualified: true,
      priorityScore: 78,
      phone: "07700900112",
      websiteUri: "https://facebook.com/seed-guildford-gas",
    },
    {
      suffix: "directory",
      displayName: `${SEED.LABEL} Surrey Drain Pros`,
      occupation: "drainage",
      town: "Woking",
      websiteClass: "DIRECTORY_ONLY",
      websiteCheck: "OK",
      outreachStatus: "INTERESTED",
      qualified: true,
      priorityScore: 71,
      phone: "07700900113",
      websiteUri: "https://checkatrade.com/seed-surrey-drain",
    },
    {
      suffix: "proper",
      displayName: `${SEED.LABEL} Proper Pipes Ltd`,
      occupation: "plumber",
      town: "Byfleet",
      websiteClass: "PROPER",
      websiteCheck: "OK",
      outreachStatus: "DEAD",
      qualified: false,
      disqualifiedReason: `${SEED.LABEL} Already has a proper website`,
      priorityScore: 20,
      websiteUri: "https://example-proper-pipes.test",
    },
    {
      suffix: "dead_site",
      displayName: `${SEED.LABEL} Ghost Heating`,
      occupation: "heating engineer",
      town: "Addlestone",
      websiteClass: "PROPER_DEAD",
      websiteCheck: "DEAD",
      outreachStatus: "SCREENED",
      qualified: true,
      priorityScore: 85,
      phone: "07700900114",
      websiteUri: "https://ghost-heating-dead.test",
    },
  ];

  const leads = [];
  for (const spec of leadSpecs) {
    const lead = await prisma.lead.create({
      data: {
        placeId: `${SEED.PLACE_PREFIX}${spec.suffix}`,
        displayName: spec.displayName,
        occupation: spec.occupation,
        town: spec.town,
        formattedAddress: `1 Seed Street, ${spec.town}, GU21 6XX`,
        lat: 51.32 + Math.random() * 0.02,
        lng: -0.55 + Math.random() * 0.02,
        phone: spec.phone,
        phoneIsMobile: Boolean(spec.phone),
        email: `seed+${spec.suffix}@tradersmate.test`,
        googleMapsUri: `https://maps.google.com/?q=${SEED.PLACE_PREFIX}${spec.suffix}`,
        primaryType: spec.occupation,
        editorialSummary: `${SEED.LABEL} Sample Google summary for ${spec.displayName}.`,
        openingHours: JSON.stringify(["Mon–Fri 08:00–17:00", "Sat 09:00–12:00"]),
        googleReviews: [
          { author: "Seed Reviewer", text: "Quick response, tidy work.", rating: 5 },
          { author: "Test Customer", text: "Fair price.", rating: 4 },
        ],
        websiteUri: spec.websiteUri,
        websiteClass: spec.websiteClass,
        websiteCheck: spec.websiteCheck,
        businessStatus: "OPERATIONAL" satisfies BizStatus,
        rating: 4.6,
        userRatingCount: 48,
        lastReviewAt: daysAgo(12),
        photoCount: 6,
        domainSuggested: spec.domainSuggested,
        domainAvailable: spec.domainAvailable ?? "UNKNOWN",
        affiliateUrl: spec.domainSuggested
          ? `https://www.ionos.co.uk/domains/domain-names?domain=${spec.domainSuggested}`
          : null,
        qualified: spec.qualified,
        disqualifiedReason: spec.disqualifiedReason ?? null,
        priorityScore: spec.priorityScore,
        outreachStatus: spec.outreachStatus,
        tpsCheckedAt: daysAgo(2),
        notes: `${SEED.LABEL} Seed lead for UI testing (${spec.suffix}).`,
        siteSlug: spec.suffix === "none_mobile" ? "seed-apex-boiler" : null,
        siteGeneratedAt: spec.suffix === "none_mobile" ? daysAgo(1) : null,
        searchRunId: searchRun.id,
      },
    });
    leads.push(lead);
  }

  console.log("Seeding Clients (CRM Clients + tradie tenants)…");
  const demoLead = leads.find((l) => l.placeId === `${SEED.PLACE_PREFIX}none_mobile`)!;

  const demo = await prisma.client.create({
    data: {
      leadId: demoLead.id,
      businessName: `${SEED.LABEL} Demo Plumbing Co`,
      tradeTitle: "Plumbing & Heating",
      town: "Woking",
      postcode: "GU21 6AA",
      routeKey: SEED_ROUTE_KEYS.demoPlumbing,
      destPhone: SEED_PHONES.demoPlumbing,
      destChannel: "SMS" satisfies Channel,
      status: "ACTIVE" satisfies ClientStatus,
      phoneVerifiedAt: daysAgo(10),
      trialEndsAt: null,
      twilioNumber: "+447000001001",
      inboundEmailLocal: `${SEED.EMAIL_PREFIX}demo-plumbing`,
      bankName: "Seed Bank UK",
      bankSortCode: "00-00-00",
      bankAccountName: "Demo Plumbing Co",
      bankAccountNumber: "12345678",
      stripeCustomerId: "cus_seed_demo_plumbing",
      stripeSubId: "sub_seed_demo_plumbing",
      allowedOrigins: ["https://traders-mate-lyart.vercel.app", "http://localhost:5173"],
      tradieNotifyTpl: `${SEED.LABEL} New job from {{name}} {{phone}}: {{message}}`,
      customerAckTpl: `${SEED.LABEL} Thanks {{name}} — Demo Plumbing will text you shortly.`,
    },
  });

  await prisma.lead.update({
    where: { id: demoLead.id },
    data: { outreachStatus: "SOLD" },
  });

  const trial = await prisma.client.create({
    data: {
      businessName: `${SEED.LABEL} Trial Electrics`,
      tradeTitle: "Electrician",
      town: "Guildford",
      postcode: "GU1 3AA",
      routeKey: SEED_ROUTE_KEYS.trialElectric,
      destPhone: SEED_PHONES.trialElectric,
      destChannel: "WHATSAPP",
      status: "TRIAL",
      phoneVerifiedAt: daysAgo(1),
      trialEndsAt: daysFromNow(10),
      inboundEmailLocal: `${SEED.EMAIL_PREFIX}trial-electric`,
    },
  });

  const pastDue = await prisma.client.create({
    data: {
      businessName: `${SEED.LABEL} Past Due Roofing`,
      tradeTitle: "Roofer",
      town: "Woking",
      postcode: "GU22 7AA",
      routeKey: SEED_ROUTE_KEYS.pastDueRoofer,
      destPhone: SEED_PHONES.pastDueRoofer,
      destChannel: "BOTH",
      status: "PAST_DUE",
      phoneVerifiedAt: daysAgo(40),
      trialEndsAt: daysAgo(20),
      stripeCustomerId: "cus_seed_pastdue",
    },
  });

  const suspended = await prisma.client.create({
    data: {
      businessName: `${SEED.LABEL} Suspended Painters`,
      tradeTitle: "Painter & Decorator",
      town: "Addlestone",
      postcode: "KT15 1AA",
      routeKey: SEED_ROUTE_KEYS.suspendedPainter,
      destPhone: SEED_PHONES.suspendedPainter,
      destChannel: "SMS",
      status: "SUSPENDED",
      phoneVerifiedAt: daysAgo(60),
    },
  });

  void pastDue;
  void suspended;

  console.log("Seeding price book, assets, voice notes…");
  const callout = await prisma.priceBookItem.create({
    data: {
      clientId: demo.id,
      sku: "SEED-CALLOUT",
      label: "Call-out / diagnosis",
      tradeTag: "plumbing",
      unit: "JOB",
      unitPricePence: 7500,
      vatRate: 20,
      isCallout: true,
      active: true,
    },
  });
  const boilerService = await prisma.priceBookItem.create({
    data: {
      clientId: demo.id,
      sku: "SEED-BOILER",
      label: "Boiler service",
      tradeTag: "heating",
      unit: "JOB",
      unitPricePence: 12000,
      vatRate: 20,
      active: true,
    },
  });
  const labourHour = await prisma.priceBookItem.create({
    data: {
      clientId: demo.id,
      sku: "SEED-LABOUR",
      label: "Labour",
      tradeTag: "plumbing",
      unit: "HOUR",
      unitPricePence: 5500,
      vatRate: 20,
      active: true,
    },
  });
  await prisma.priceBookItem.create({
    data: {
      clientId: demo.id,
      sku: "SEED-INACTIVE",
      label: "Old inactive rate",
      unit: "EACH",
      unitPricePence: 1000,
      active: false,
    },
  });
  await prisma.priceBookItem.create({
    data: {
      clientId: trial.id,
      label: "Consumer unit upgrade",
      unit: "JOB",
      unitPricePence: 45000,
      tradeTag: "electrical",
    },
  });

  await prisma.clientAsset.createMany({
    data: [
      {
        clientId: demo.id,
        kind: "LOGO" satisfies ClientAssetKind,
        url: "https://placehold.co/200x80/png?text=SEED+Logo",
        filename: "seed-logo.png",
        caption: "Seed logo",
        sort: 0,
      },
      {
        clientId: demo.id,
        kind: "SHOWCASE",
        url: "https://placehold.co/800x500/png?text=SEED+Bathroom",
        filename: "seed-bathroom.png",
        caption: "Bathroom refit showcase",
        sort: 1,
      },
      {
        clientId: demo.id,
        kind: "JOB",
        url: "https://placehold.co/800x500/png?text=SEED+Boiler",
        filename: "seed-boiler.png",
        caption: "Boiler install job photo",
        sort: 2,
      },
    ],
  });

  console.log("Seeding enquiries / jobs…");
  const enqAlice = await prisma.enquiry.create({
    data: {
      clientId: demo.id,
      name: "Alice Seed",
      phone: SEED_PHONES.customerAlice,
      message: "Boiler making a loud bang on startup. Freezing radiators upstairs.",
      postcode: "GU21 4BB",
      distanceMiles: 2.4,
      photoUrls: ["https://placehold.co/400x300/png?text=SEED+Photo1"],
      source: "site",
      status: "ROUTED",
      deliveredAt: daysAgo(3),
      deliveryInfo: "SMS delivered (seed)",
      createdAt: daysAgo(3),
    },
  });
  const enqBob = await prisma.enquiry.create({
    data: {
      clientId: demo.id,
      name: "Bob Seed",
      phone: SEED_PHONES.customerBob,
      message: "Need a quote for a new bathroom suite install.",
      postcode: "GU22 8CC",
      distanceMiles: 4.1,
      source: "widget",
      status: "ROUTED",
      deliveredAt: daysAgo(5),
      createdAt: daysAgo(5),
    },
  });
  const enqCara = await prisma.enquiry.create({
    data: {
      clientId: demo.id,
      name: "Cara Seed",
      phone: SEED_PHONES.customerCara,
      message: "Tap dripping in kitchen — can you come tomorrow?",
      postcode: "GU21 2DD",
      source: "hosted",
      status: "HELD",
      deliveryInfo: "Held — client PAST_DUE simulation path",
      createdAt: daysAgo(1),
    },
  });
  const enqDan = await prisma.enquiry.create({
    data: {
      clientId: demo.id,
      name: "Dan Seed",
      phone: SEED_PHONES.customerDan,
      message: "Power shower not heating.",
      postcode: "KT14 6EE",
      source: "missed-call",
      status: "ROUTED",
      deliveredAt: daysAgo(0),
      createdAt: daysAgo(0),
    },
  });
  await prisma.enquiry.create({
    data: {
      clientId: trial.id,
      name: "Eve Seed",
      phone: SEED_PHONES.customerEve,
      message: "Rewire quote for 3-bed terrace.",
      postcode: "GU1 2FF",
      source: "inbound-email",
      status: "FAILED",
      deliveryInfo: "Seed delivery failure for UI",
      createdAt: daysAgo(2),
    },
  });

  const voiceReady = await prisma.voiceNote.create({
    data: {
      clientId: demo.id,
      enquiryId: enqAlice.id,
      audioUrl: "https://example.com/seed-audio-alice.m4a",
      transcript:
        "Customer wants boiler service and one radiator bleed. Call-out seventy five, boiler service one twenty.",
      status: "READY" satisfies VoiceNoteStatus,
      durationSec: 42,
      rawExtract: {
        lines: [
          { label: "Call-out / diagnosis", qty: 1, unitPricePence: 7500 },
          { label: "Boiler service", qty: 1, unitPricePence: 12000 },
        ],
      },
    },
  });
  await prisma.voiceNote.create({
    data: {
      clientId: demo.id,
      enquiryId: enqBob.id,
      status: "TRANSCRIBING",
      audioUrl: "https://example.com/seed-audio-bob.m4a",
      durationSec: 18,
    },
  });
  await prisma.voiceNote.create({
    data: {
      clientId: demo.id,
      enquiryId: enqCara.id,
      status: "FAILED",
      error: `${SEED.LABEL} Transcription failed (seed)`,
      audioUrl: "https://example.com/seed-audio-cara.m4a",
    },
  });

  console.log("Seeding quotes (all statuses)…");
  async function createQuote(opts: {
    token: string;
    enquiryId: string;
    status: QuoteStatus;
    voiceNoteId?: string;
    sentDaysAgo?: number;
    lines: Array<{
      label: string;
      qty: number;
      unit: PriceUnit;
      unitPricePence: number;
      priceBookItemId?: string;
      source?: string;
    }>;
    customerNote?: string;
    assumptions?: string;
  }) {
    const subtotal = opts.lines.reduce((s, l) => s + Math.round(l.qty * l.unitPricePence), 0);
    const vat = Math.round(subtotal - subtotal / 1.2);
    const net = subtotal - vat;
    const quote = await prisma.quote.create({
      data: {
        clientId: demo.id,
        enquiryId: opts.enquiryId,
        voiceNoteId: opts.voiceNoteId,
        status: opts.status,
        currency: "GBP",
        vatInclusive: true,
        subtotalPence: net,
        vatPence: vat,
        totalPence: subtotal,
        publicToken: `${SEED.TOKEN_PREFIX}${opts.token}`,
        customerNote: opts.customerNote ?? `${SEED.LABEL} Thanks for the enquiry.`,
        assumptions: opts.assumptions ?? "Parts availability dependent. Access to cupboard required.",
        sentAt: opts.sentDaysAgo != null ? daysAgo(opts.sentDaysAgo) : null,
        decidedAt: ["ACCEPTED", "DECLINED"].includes(opts.status) ? daysAgo(1) : null,
        validUntil: daysFromNow(14),
        createdAt: daysAgo(opts.sentDaysAgo ?? 2),
      },
    });
    await prisma.quoteLine.createMany({
      data: opts.lines.map((l, i) => ({
        quoteId: quote.id,
        sort: i,
        label: l.label,
        qty: l.qty,
        unit: l.unit,
        unitPricePence: l.unitPricePence,
        vatRate: 20,
        priceBookItemId: l.priceBookItemId,
        source: l.source ?? "MANUAL",
      })),
    });
    return quote;
  }

  const quoteDraft = await createQuote({
    token: "quote_draft_alice",
    enquiryId: enqAlice.id,
    status: "DRAFT",
    voiceNoteId: voiceReady.id,
    lines: [
      {
        label: "Call-out / diagnosis",
        qty: 1,
        unit: "JOB",
        unitPricePence: 7500,
        priceBookItemId: callout.id,
        source: "BOOK",
      },
      {
        label: "Boiler service",
        qty: 1,
        unit: "JOB",
        unitPricePence: 12000,
        priceBookItemId: boilerService.id,
        source: "VOICE",
      },
    ],
  });

  const quoteSent = await createQuote({
    token: "quote_sent_bob",
    enquiryId: enqBob.id,
    status: "SENT",
    sentDaysAgo: 4,
    lines: [
      { label: "Bathroom suite supply & fit", qty: 1, unit: "JOB", unitPricePence: 280000 },
      { label: "Labour", qty: 16, unit: "HOUR", unitPricePence: 5500, priceBookItemId: labourHour.id, source: "BOOK" },
    ],
    customerNote: "Includes waste removal. Tiles by customer.",
  });

  const quoteAccepted = await createQuote({
    token: "quote_accepted_dan",
    enquiryId: enqDan.id,
    status: "ACCEPTED",
    sentDaysAgo: 6,
    lines: [
      { label: "Power shower swap", qty: 1, unit: "JOB", unitPricePence: 32000 },
      { label: "Call-out / diagnosis", qty: 1, unit: "JOB", unitPricePence: 7500, priceBookItemId: callout.id },
    ],
  });

  await createQuote({
    token: "quote_declined_cara",
    enquiryId: enqCara.id,
    status: "DECLINED",
    sentDaysAgo: 8,
    lines: [{ label: "Tap replacement", qty: 1, unit: "JOB", unitPricePence: 9500 }],
  });

  await createQuote({
    token: "quote_expired_bob2",
    enquiryId: enqBob.id,
    status: "EXPIRED",
    sentDaysAgo: 40,
    lines: [{ label: "Half bath refresh", qty: 1, unit: "JOB", unitPricePence: 90000 }],
  });

  console.log("Seeding invoices + follow-ups…");
  async function createInvoice(opts: {
    token: string;
    enquiryId: string;
    quoteId?: string;
    status: InvoiceStatus;
    customerName: string;
    customerPhone: string;
    totalPence: number;
    sentDaysAgo?: number;
    paid?: boolean;
    overdue?: boolean;
  }) {
    const vat = Math.round(opts.totalPence - opts.totalPence / 1.2);
    const net = opts.totalPence - vat;
    const inv = await prisma.invoice.create({
      data: {
        clientId: demo.id,
        enquiryId: opts.enquiryId,
        quoteId: opts.quoteId,
        status: opts.status,
        publicToken: `${SEED.TOKEN_PREFIX}${opts.token}`,
        customerName: opts.customerName,
        customerPhone: opts.customerPhone,
        currency: "GBP",
        vatInclusive: true,
        subtotalPence: net,
        vatPence: vat,
        totalPence: opts.totalPence,
        dueDate: opts.overdue ? daysAgo(3) : daysFromNow(7),
        reference: `SEED-INV-${opts.token}`,
        bankName: "Seed Bank UK",
        bankSortCode: "00-00-00",
        bankAccountName: "Demo Plumbing Co",
        bankAccountNumber: "12345678",
        customerNote: `${SEED.LABEL} Please pay by bank transfer quoting the reference.`,
        sentAt: opts.sentDaysAgo != null ? daysAgo(opts.sentDaysAgo) : null,
        paidAt: opts.paid ? daysAgo(1) : null,
        paidReportedAt: opts.paid ? daysAgo(1) : null,
        createdAt: daysAgo(opts.sentDaysAgo ?? 2),
      },
    });
    await prisma.invoiceLine.create({
      data: {
        invoiceId: inv.id,
        sort: 0,
        label: "Seed invoice line",
        qty: 1,
        unit: "JOB",
        unitPricePence: opts.totalPence,
        vatRate: 20,
      },
    });
    return inv;
  }

  const invSent = await createInvoice({
    token: "inv_sent_dan",
    enquiryId: enqDan.id,
    quoteId: quoteAccepted.id,
    status: "SENT",
    customerName: "Dan Seed",
    customerPhone: SEED_PHONES.customerDan,
    totalPence: 39500,
    sentDaysAgo: 2,
  });

  await createInvoice({
    token: "inv_paid_alice",
    enquiryId: enqAlice.id,
    quoteId: quoteDraft.id,
    status: "PAID",
    customerName: "Alice Seed",
    customerPhone: SEED_PHONES.customerAlice,
    totalPence: 19500,
    sentDaysAgo: 10,
    paid: true,
  });

  await createInvoice({
    token: "inv_overdue_bob",
    enquiryId: enqBob.id,
    quoteId: quoteSent.id,
    status: "OVERDUE",
    customerName: "Bob Seed",
    customerPhone: SEED_PHONES.customerBob,
    totalPence: 50000,
    sentDaysAgo: 20,
    overdue: true,
  });

  await createInvoice({
    token: "inv_draft_cara",
    enquiryId: enqCara.id,
    status: "DRAFT",
    customerName: "Cara Seed",
    customerPhone: SEED_PHONES.customerCara,
    totalPence: 9500,
  });

  await createInvoice({
    token: "inv_void_eve",
    enquiryId: enqDan.id,
    status: "VOID",
    customerName: "Dan Seed",
    customerPhone: SEED_PHONES.customerDan,
    totalPence: 1000,
    sentDaysAgo: 15,
  });

  await prisma.followUp.createMany({
    data: [
      {
        quoteId: quoteSent.id,
        kind: "QUOTE_D2" satisfies FollowUpKind,
        status: "SENT" satisfies FollowUpStatus,
        runAt: daysAgo(2),
        sentAt: daysAgo(2),
        bodySnapshot: `${SEED.LABEL} Quote chase day 2`,
      },
      {
        quoteId: quoteSent.id,
        kind: "QUOTE_D5",
        status: "PENDING",
        runAt: daysFromNow(1),
        bodySnapshot: `${SEED.LABEL} Quote chase day 5`,
      },
      {
        invoiceId: invSent.id,
        kind: "INVOICE_D3",
        status: "PENDING",
        runAt: daysFromNow(1),
        bodySnapshot: `${SEED.LABEL} Invoice reminder day 3`,
      },
      {
        invoiceId: invSent.id,
        kind: "INVOICE_D7",
        status: "CANCELLED",
        runAt: daysFromNow(5),
      },
    ],
  });

  console.log("Seeding messages + missed calls…");
  await prisma.message.createMany({
    data: [
      {
        clientId: demo.id,
        enquiryId: enqAlice.id,
        direction: "OUTBOUND" satisfies MessageDirection,
        channel: "SMS" satisfies MessageChannel,
        toAddr: SEED_PHONES.customerAlice,
        fromAddr: "+447000001001",
        body: `${SEED.LABEL} Hi Alice — thanks for your enquiry. Here's your quote link.`,
        twilioSid: "SM_seed_out_1",
        status: "delivered",
        createdAt: daysAgo(3),
      },
      {
        clientId: demo.id,
        enquiryId: enqAlice.id,
        direction: "INBOUND",
        channel: "SMS",
        toAddr: "+447000001001",
        fromAddr: SEED_PHONES.customerAlice,
        body: "Thanks — can you do Thursday morning?",
        twilioSid: "SM_seed_in_1",
        status: "received",
        createdAt: daysAgo(2),
      },
      {
        clientId: demo.id,
        enquiryId: enqDan.id,
        direction: "OUTBOUND",
        channel: "WHATSAPP",
        toAddr: SEED_PHONES.customerDan,
        fromAddr: "+447000001001",
        body: `${SEED.LABEL} Invoice for power shower work.`,
        status: "sent",
        createdAt: daysAgo(2),
      },
      {
        clientId: demo.id,
        enquiryId: enqBob.id,
        direction: "OUTBOUND",
        channel: "EMAIL",
        toAddr: "bob.seed@tradersmate.test",
        fromAddr: "jobs@tradersmate.test",
        body: `${SEED.LABEL} Quote attached for bathroom install.`,
        status: "sent",
        createdAt: daysAgo(4),
      },
      {
        clientId: demo.id,
        enquiryId: enqAlice.id,
        direction: "OUTBOUND",
        channel: "SYSTEM",
        toAddr: SEED_PHONES.demoPlumbing,
        body: `${SEED.LABEL} System: quote accepted webhook stub`,
        status: "logged",
        createdAt: daysAgo(1),
      },
    ],
  });

  await prisma.missedCall.createMany({
    data: [
      {
        clientId: demo.id,
        callerPhone: SEED_PHONES.missedCaller,
        status: "QUALIFYING" satisfies MissedCallStatus,
        conversation: [
          { role: "assistant", text: "Sorry we missed your call — what do you need help with?", at: daysAgo(0).toISOString() },
          { role: "user", text: "My boiler won't fire up", at: daysAgo(0).toISOString() },
        ],
        callSid: "CA_seed_missed_1",
      },
      {
        clientId: demo.id,
        callerPhone: SEED_PHONES.customerDan,
        status: "CONVERTED",
        enquiryId: enqDan.id,
        conversation: [
          { role: "assistant", text: "Got it — creating a job card.", at: daysAgo(0).toISOString() },
        ],
        callSid: "CA_seed_missed_2",
      },
      {
        clientId: demo.id,
        callerPhone: "07000003999",
        status: "SPAM",
        conversation: [{ role: "system", text: "Marked spam (seed)", at: daysAgo(1).toISOString() }],
      },
      {
        clientId: demo.id,
        callerPhone: "07000003998",
        status: "EXPIRED",
        callSid: "CA_seed_missed_expired",
      },
      {
        clientId: demo.id,
        callerPhone: "07000003997",
        status: "PENDING",
        callSid: "CA_seed_missed_pending",
      },
    ],
  });

  // Long-lived session for browser testing without SMS
  await prisma.clientSession.create({
    data: {
      clientId: demo.id,
      tokenHash: hashToken(`session:${SEED.SESSION_RAW}`),
      expiresAt: daysFromNow(30),
      lastSeenAt: new Date(),
    },
  });

  await prisma.otpChallenge.create({
    data: {
      clientId: demo.id,
      phone: SEED_PHONES.demoPlumbing,
      codeHash: hashToken("otp:000000"),
      purpose: "login",
      expiresAt: daysFromNow(1),
      payload: { seed: true },
    },
  });

  console.log("\n========== SEED READY ==========");
  console.log("CRM: open /search, /leads, /clients — look for [SEED] names");
  console.log("Tradie login:");
  console.log(`  Route key:  ${SEED_ROUTE_KEYS.demoPlumbing}`);
  console.log(`  Phone:      ${SEED_PHONES.demoPlumbing}`);
  console.log(`  Session:    localStorage.setItem("tm_tradie_session", "${SEED.SESSION_RAW}")`);
  console.log(`  Or POST /api/tradie/auth/magic with { "routeKey": "${SEED_ROUTE_KEYS.demoPlumbing}" }`);
  console.log(`Public quote:  /q/${SEED.TOKEN_PREFIX}quote_sent_bob`);
  console.log(`Public invoice: /i/${SEED.TOKEN_PREFIX}inv_sent_dan`);
  console.log("Wipe before launch: npm run db:seed:wipe");
  console.log("================================\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
