import { prisma } from "../../db.js";

/**
 * Assembling the customer record the wireframes ask for.
 *
 * Two things worth knowing before reading on.
 *
 * The activity timeline is *derived*, never stored. Sheet 1 screen 8 is quotes,
 * invoices, messages and appointments in date order — all of which already exist.
 * An events table would have to be written to from a dozen call sites and would
 * be wrong the first time one was missed, which is worse than useless in a
 * history the tradie is trusting.
 *
 * Access codes never leave here in the clear on a list response. The detail
 * endpoint returns whether a code exists, not what it is; revealing it is a
 * separate, deliberate request. Sending the code with every customer fetch would
 * make "masked in the UI" a lie the moment anyone opened the network tab.
 */

export const contactSelect = {
  id: true,
  name: true,
  role: true,
  phone: true,
  email: true,
  isPrimary: true,
  receivesQuotes: true,
  receivesInvoices: true,
  receivesAppointments: true,
  notes: true,
  sort: true,
} as const;

export const assetSelect = {
  id: true,
  propertyId: true,
  kind: true,
  name: true,
  manufacturer: true,
  model: true,
  serial: true,
  installDate: true,
  location: true,
  warrantyUntil: true,
  lastServiceAt: true,
  nextDueAt: true,
  notes: true,
  sort: true,
} as const;

/** Everything about access except the code itself. */
export const accessSelect = {
  id: true,
  accessMethod: true,
  keySafe: true,
  keySafeLocation: true,
  alarm: true,
  parking: true,
  permitRequired: true,
  workingHoursFrom: true,
  workingHoursTo: true,
  callBeforeArrival: true,
  dogOnSite: true,
  asbestosKnown: true,
  safetyFlags: true,
  engineerNotes: true,
} as const;

type AccessRow = { accessCode?: string | null } & Record<string, unknown>;

/** Swap the code for a flag. The UI shows dots and asks for it separately. */
export function maskAccess<T extends AccessRow | null | undefined>(access: T) {
  if (!access) return access;
  const { accessCode, ...rest } = access;
  return { ...rest, hasAccessCode: Boolean(accessCode && accessCode.length > 0) };
}

export async function listCustomers(clientId: string) {
  const customers = await prisma.customer.findMany({
    where: { clientId },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { properties: true, enquiries: true } },
      contacts: { where: { isPrimary: true }, take: 1, select: contactSelect },
      properties: { orderBy: { sort: "asc" }, take: 1, select: { postcode: true, town: true } },
    },
  });

  // One grouped query rather than a per-customer count — a tradie with 400
  // customers shouldn't pay 400 round trips to see a list.
  const outstanding = await prisma.invoice.groupBy({
    by: ["customerId"],
    where: { clientId, customerId: { not: null }, status: { in: ["SENT", "OVERDUE"] } },
    _sum: { amountDuePence: true, totalPence: true },
    _count: { _all: true },
  });
  const owed = new Map(
    outstanding.map((o) => [
      o.customerId!,
      { pence: o._sum.amountDuePence || o._sum.totalPence || 0, count: o._count._all },
    ])
  );

  return customers.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    phone: c.phone,
    phoneKey: c.phoneKey,
    email: c.email,
    tags: c.tags,
    postcode: c.billingPostcode || c.properties[0]?.postcode || null,
    town: c.properties[0]?.town || null,
    propertyCount: c._count.properties,
    jobCount: c._count.enquiries,
    primaryContact: c.contacts[0] || null,
    outstandingPence: owed.get(c.id)?.pence ?? 0,
    outstandingCount: owed.get(c.id)?.count ?? 0,
  }));
}

/** Resolve by real id, falling back to the legacy phone key so old links survive. */
export async function findCustomer(clientId: string, idOrPhoneKey: string) {
  const byId = await prisma.customer.findFirst({ where: { id: idOrPhoneKey, clientId } });
  if (byId) return byId;
  return prisma.customer.findFirst({ where: { clientId, phoneKey: idOrPhoneKey } });
}

export async function getCustomerRecord(clientId: string, idOrPhoneKey: string) {
  const base = await findCustomer(clientId, idOrPhoneKey);
  if (!base) return null;

  const [customer, invoiceAgg, openJobs, draftQuotes, nextAppointment] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: base.id },
      include: {
        contacts: { orderBy: [{ isPrimary: "desc" }, { sort: "asc" }], select: contactSelect },
        properties: {
          orderBy: { sort: "asc" },
          include: {
            access: { select: { ...accessSelect, accessCode: true } },
            assets: { orderBy: { sort: "asc" }, select: assetSelect },
            _count: { select: { enquiries: true } },
          },
        },
        reminders: { where: { active: true }, orderBy: { dueAt: "asc" }, take: 10 },
        customerNotes: { orderBy: [{ pinned: "desc" }, { createdAt: "desc" }] },
        files: { orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.invoice.groupBy({
      by: ["status"],
      where: { clientId, customerId: base.id },
      _sum: { amountDuePence: true, totalPence: true },
      _count: { _all: true },
    }),
    prisma.enquiry.count({
      where: { clientId, customerId: base.id, pipeline: { in: ["INBOX", "JOB"] } },
    }),
    prisma.quote.aggregate({
      where: { clientId, status: "DRAFT", enquiry: { customerId: base.id } },
      _sum: { totalPence: true },
      _count: { _all: true },
    }),
    prisma.appointment.findFirst({
      where: { clientId, startsAt: { gte: new Date() }, enquiry: { customerId: base.id } },
      orderBy: { startsAt: "asc" },
    }),
  ]);
  if (!customer) return null;

  const outstandingPence = invoiceAgg
    .filter((r) => r.status === "SENT" || r.status === "OVERDUE")
    .reduce((sum, r) => sum + (r._sum.amountDuePence || r._sum.totalPence || 0), 0);
  const overdueCount = invoiceAgg.find((r) => r.status === "OVERDUE")?._count._all ?? 0;
  const outstandingCount = invoiceAgg
    .filter((r) => r.status === "SENT" || r.status === "OVERDUE")
    .reduce((n, r) => n + r._count._all, 0);
  const paidPence = invoiceAgg
    .filter((r) => r.status === "PAID")
    .reduce((sum, r) => sum + (r._sum.totalPence || 0), 0);

  const openJobValue = await prisma.quote.aggregate({
    where: {
      clientId,
      status: { in: ["DRAFT", "SENT", "ACCEPTED"] },
      enquiry: { customerId: base.id, pipeline: { in: ["INBOX", "JOB"] } },
    },
    _sum: { totalPence: true },
  });

  return {
    ...customer,
    properties: customer.properties.map((p) => ({
      ...p,
      access: maskAccess(p.access),
      openJobCount: p._count.enquiries,
    })),
    summary: {
      outstandingPence,
      outstandingCount,
      overdueCount,
      paidPence,
      openJobs,
      openJobValuePence: openJobValue._sum.totalPence || 0,
      draftQuotes: draftQuotes._count._all,
      draftQuoteValuePence: draftQuotes._sum.totalPence || 0,
      nextAppointment: nextAppointment
        ? {
            id: nextAppointment.id,
            title: nextAppointment.title,
            startsAt: nextAppointment.startsAt,
            endsAt: nextAppointment.endsAt,
          }
        : null,
    },
  };
}

export type ActivityItem = {
  id: string;
  at: Date;
  kind: string;
  title: string;
  detail: string | null;
  tone: "info" | "good" | "alert";
  href: string | null;
};

/**
 * The activity timeline, built from records that already exist.
 *
 * Deliberately not an event table: see the note at the top of this file.
 */
export async function getCustomerActivity(clientId: string, customerId: string, limit = 40) {
  const [quotes, invoices, appointments, messages, jobs] = await Promise.all([
    prisma.quote.findMany({
      where: { clientId, enquiry: { customerId } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, reference: true, status: true, createdAt: true, sentAt: true, decidedAt: true, enquiryId: true },
    }),
    prisma.invoice.findMany({
      where: { clientId, customerId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, reference: true, status: true, createdAt: true, sentAt: true, paidAt: true, dueDate: true, enquiryId: true },
    }),
    prisma.appointment.findMany({
      where: { clientId, enquiry: { customerId } },
      orderBy: { startsAt: "desc" },
      take: limit,
      select: { id: true, title: true, startsAt: true, createdAt: true, enquiryId: true },
    }),
    prisma.message.findMany({
      where: { clientId, enquiry: { customerId } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, direction: true, channel: true, body: true, createdAt: true, enquiryId: true },
    }),
    prisma.enquiry.findMany({
      where: { clientId, customerId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, summary: true, message: true, createdAt: true, promotedAt: true },
    }),
  ]);

  const items: ActivityItem[] = [];
  const now = Date.now();

  for (const j of jobs) {
    items.push({
      id: `job-${j.id}`,
      at: j.createdAt,
      kind: "JOB",
      title: "Job created",
      detail: j.summary || j.message || null,
      tone: "info",
      href: `/t/jobs/${j.id}`,
    });
  }

  for (const q of quotes) {
    if (q.sentAt) {
      items.push({
        id: `quote-sent-${q.id}`,
        at: q.sentAt,
        kind: "QUOTE_SENT",
        title: "Quote sent",
        detail: q.reference || null,
        tone: "info",
        href: q.enquiryId ? `/t/jobs/${q.enquiryId}` : null,
      });
    }
    if (q.decidedAt) {
      items.push({
        id: `quote-decided-${q.id}`,
        at: q.decidedAt,
        kind: "QUOTE_DECIDED",
        title: q.status === "ACCEPTED" ? "Quote accepted" : "Quote declined",
        detail: q.reference || null,
        tone: q.status === "ACCEPTED" ? "good" : "alert",
        href: q.enquiryId ? `/t/jobs/${q.enquiryId}` : null,
      });
    }
  }

  for (const inv of invoices) {
    if (inv.sentAt) {
      items.push({
        id: `inv-sent-${inv.id}`,
        at: inv.sentAt,
        kind: "INVOICE_SENT",
        title: "Invoice sent",
        detail: inv.reference || null,
        tone: "info",
        href: inv.enquiryId ? `/t/jobs/${inv.enquiryId}` : "/t/invoices",
      });
    }
    if (inv.paidAt) {
      items.push({
        id: `inv-paid-${inv.id}`,
        at: inv.paidAt,
        kind: "INVOICE_PAID",
        title: "Invoice paid",
        detail: inv.reference || null,
        tone: "good",
        href: inv.enquiryId ? `/t/jobs/${inv.enquiryId}` : "/t/invoices",
      });
    }
    // Overdue is a state, not an event — surfaced at the date it went past due so
    // it lands in the timeline where the tradie would expect to see it.
    if (!inv.paidAt && inv.dueDate && inv.dueDate.getTime() < now) {
      items.push({
        id: `inv-overdue-${inv.id}`,
        at: inv.dueDate,
        kind: "INVOICE_OVERDUE",
        title: `Invoice ${inv.reference || ""} is overdue`.trim(),
        detail: null,
        tone: "alert",
        href: inv.enquiryId ? `/t/jobs/${inv.enquiryId}` : "/t/invoices",
      });
    }
  }

  for (const a of appointments) {
    items.push({
      id: `appt-${a.id}`,
      at: a.createdAt,
      kind: "VISIT_BOOKED",
      title: "Visit booked",
      detail: a.title,
      tone: "info",
      href: a.enquiryId ? `/t/jobs/${a.enquiryId}` : "/t/diary",
    });
  }

  for (const m of messages) {
    items.push({
      id: `msg-${m.id}`,
      at: m.createdAt,
      kind: m.direction === "INBOUND" ? "CUSTOMER_REPLIED" : "MESSAGE_SENT",
      title: m.direction === "INBOUND" ? "Customer replied" : `Message sent (${m.channel})`,
      detail: m.body ? m.body.slice(0, 120) : null,
      tone: "info",
      href: m.enquiryId ? `/t/jobs/${m.enquiryId}` : null,
    });
  }

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

export async function getCustomerJobs(clientId: string, customerId: string) {
  const jobs = await prisma.enquiry.findMany({
    where: { clientId, customerId },
    orderBy: { createdAt: "desc" },
    include: {
      property: { select: { id: true, nickname: true, postcode: true } },
      quotes: {
        where: { status: { notIn: ["DELETED", "ARCHIVED"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, totalPence: true },
      },
    },
  });
  return jobs.map((j) => ({
    id: j.id,
    title: j.summary || j.message || "Job",
    createdAt: j.createdAt,
    pipeline: j.pipeline,
    property: j.property,
    latestQuote: j.quotes[0] || null,
  }));
}

export async function getCustomerBilling(clientId: string, customerId: string) {
  const invoices = await prisma.invoice.findMany({
    where: { clientId, customerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      reference: true,
      status: true,
      totalPence: true,
      amountDuePence: true,
      dueDate: true,
      sentAt: true,
      paidAt: true,
      createdAt: true,
      enquiryId: true,
      publicToken: true,
    },
  });

  const now = Date.now();
  const rows = invoices.map((i) => ({
    ...i,
    // The stored status can lag a due date that quietly passed overnight; the
    // tradie's chase list has to reflect today, not the last time a job ran.
    overdue: !i.paidAt && !!i.dueDate && i.dueDate.getTime() < now,
  }));

  const outstanding = rows.filter((r) => !r.paidAt);
  return {
    invoices: rows,
    totals: {
      outstandingPence: outstanding.reduce((s, r) => s + (r.amountDuePence || r.totalPence), 0),
      outstandingCount: outstanding.length,
      overdueCount: rows.filter((r) => r.overdue).length,
      paidPence: rows.filter((r) => r.paidAt).reduce((s, r) => s + r.totalPence, 0),
    },
  };
}

/**
 * Exactly one primary contact per customer.
 *
 * Done in a transaction rather than with a partial unique index, because setting
 * a new primary has to clear the old one and the database would reject the
 * moment in between when both are true.
 */
export async function setPrimaryContact(clientId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, clientId } });
  if (!contact) return null;
  return prisma.$transaction(async (tx) => {
    await tx.contact.updateMany({
      where: { customerId: contact.customerId, isPrimary: true },
      data: { isPrimary: false },
    });
    return tx.contact.update({ where: { id: contactId }, data: { isPrimary: true } });
  });
}
