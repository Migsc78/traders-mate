/**
 * Customer records — the data the Customer UX wireframes were drawn against.
 *
 * Bob Seed is the worked example: four contacts with different roles, three
 * properties, access and safety on each, seven assets with service dates, files,
 * notes and reminders. Everything else on the demo account gets a customer and a
 * property too, so no screen has to cope with a job that belongs to nobody.
 *
 * The point of seeding it this thoroughly is that the wireframes describe
 * relationships — a tenant at one property, an accounts contact who gets the
 * invoices, a boiler due a service next May. You cannot tell whether those work
 * from a record with one contact and one address.
 */
import type { PrismaClient } from "@prisma/client";

type Ids = {
  demoClientId: string;
  enquiryIds: {
    alice: string;
    bob: string;
    cara: string;
    dan: string;
  };
};

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function monthsFromNow(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d;
}

function at(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 9, 0, 0));
}

/** Matches routes/tradie.ts customerPhoneKey — keeps old phone-keyed links resolving. */
function phoneKeyOf(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

export async function seedCustomerRecords(prisma: PrismaClient, ids: Ids): Promise<void> {
  const { demoClientId, enquiryIds } = ids;

  // ---------------------------------------------------------------- Bob Seed
  const bobPhone = "07000000202";
  const bob = await prisma.customer.create({
    data: {
      clientId: demoClientId,
      type: "INDIVIDUAL",
      name: "Bob Seed",
      phone: bobPhone,
      phoneKey: phoneKeyOf(bobPhone),
      email: "bob.seed@email.com",
      preferredChannel: "CALL",
      billingAddress: "2 Tacka Close, Guildford",
      billingPostcode: "GU22 8CC",
      tags: ["Preferred", "Long term", "Trade"],
      paymentTerms: "14 days from invoice",
      notes: "Access via side gate. Key safe on wall by porch. Dog friendly.",
    },
  });

  // Four roles, because the whole reason contacts are their own table is that the
  // person who lets you in is rarely the person who pays.
  //
  // Created one at a time rather than in a Promise.all: the seed runs against
  // Railway over a proxied connection, and firing them in parallel was enough to
  // exhaust the pool and drop the run halfway through.
  const bobContact = await prisma.contact.create({
    data: {
      clientId: demoClientId,
      customerId: bob.id,
      name: "Bob Seed",
      role: "OWNER",
      phone: bobPhone,
      email: "bob.seed@email.com",
      isPrimary: true,
      sort: 0,
    },
  });
  await prisma.contact.create({
    data: {
      clientId: demoClientId,
      customerId: bob.id,
      name: "Sarah Seed",
      role: "ACCOUNTS",
      phone: "07711223344",
      email: "sarah.seed@email.com",
      receivesQuotes: false,
      receivesInvoices: true,
      receivesAppointments: false,
      notes: "Prefers email for invoices.",
      sort: 1,
    },
  });
  const jamesTaylor = await prisma.contact.create({
    data: {
      clientId: demoClientId,
      customerId: bob.id,
      name: "James Taylor",
      role: "TENANT",
      phone: "07712334455",
      email: "j.taylor@email.com",
      receivesQuotes: false,
      receivesInvoices: false,
      receivesAppointments: true,
      sort: 2,
    },
  });
  await prisma.contact.create({
    data: {
      clientId: demoClientId,
      customerId: bob.id,
      name: "Site Contact",
      role: "SITE_CONTACT",
      phone: "07700998877",
      email: "site.contact@email.com",
      receivesQuotes: false,
      receivesInvoices: false,
      receivesAppointments: true,
      sort: 3,
    },
  });

  // ------------------------------------------------------------- Properties
  const residence = await prisma.property.create({
    data: {
      clientId: demoClientId,
      customerId: bob.id,
      nickname: "The Seed Residence",
      addressLine1: "1 Acacia Close",
      town: "Guildford",
      postcode: "GU22 8CC",
      propertyType: "House (Detached)",
      occupancy: "OWNER_OCCUPIED",
      siteContactId: bobContact.id,
      sort: 0,
      access: {
        create: {
          clientId: demoClientId,
          accessMethod: "Key safe",
          keySafe: true,
          keySafeLocation: "On wall by porch",
          accessCode: "4829",
          alarm: true,
          parking: "On street",
          permitRequired: false,
          workingHoursFrom: "08:00",
          workingHoursTo: "17:00",
          callBeforeArrival: true,
          dogOnSite: true,
          asbestosKnown: false,
          engineerNotes: "Use side gate. Ask for Bob if tenant not in.",
        },
      },
    },
  });

  const riverside = await prisma.property.create({
    data: {
      clientId: demoClientId,
      customerId: bob.id,
      nickname: "Riverside Flat",
      addressLine1: "Flat 4, 12 Mill Lane",
      town: "Guildford",
      postcode: "GU1 4AB",
      propertyType: "Flat (Purpose built)",
      occupancy: "TENANTED",
      siteContactId: jamesTaylor.id,
      sort: 1,
      access: {
        create: {
          clientId: demoClientId,
          accessMethod: "Tenant lets in",
          keySafe: false,
          alarm: false,
          parking: "Permit required",
          permitRequired: true,
          workingHoursFrom: "09:00",
          workingHoursTo: "16:00",
          callBeforeArrival: true,
          dogOnSite: false,
          asbestosKnown: false,
          safetyFlags: ["Stairs"],
          engineerNotes: "Second floor, no lift. Ring James before setting off.",
        },
      },
    },
  });

  const holidayLet = await prisma.property.create({
    data: {
      clientId: demoClientId,
      customerId: bob.id,
      nickname: "Seed Holiday Let",
      addressLine1: "The Barn, Shalford Rd",
      town: "Guildford",
      postcode: "GU4 8AF",
      propertyType: "Barn conversion",
      occupancy: "EMPTY",
      sort: 2,
      access: {
        create: {
          clientId: demoClientId,
          accessMethod: "Key safe",
          keySafe: true,
          keySafeLocation: "Rear of oil tank",
          accessCode: "1102",
          alarm: false,
          parking: "Private drive",
          permitRequired: false,
          workingHoursFrom: "08:00",
          workingHoursTo: "18:00",
          callBeforeArrival: false,
          dogOnSite: false,
          asbestosKnown: true,
          safetyFlags: ["Asbestos", "Confined space"],
          engineerNotes: "Asbestos flue board suspected in the old boiler cupboard — do not drill.",
        },
      },
    },
  });

  // ----------------------------------------------------------------- Assets
  // Service dates are the commercial point: a next-due date is next year's work
  // already on the books, which is exactly what the wireframe note claims.
  const boiler = await prisma.asset.create({
    data: {
      clientId: demoClientId,
      propertyId: residence.id,
      kind: "Combi boiler",
      name: "Worcester Greenstar 30i",
      manufacturer: "Worcester Bosch",
      model: "Greenstar 30i",
      serial: "7716 123 4567 890",
      installDate: at(2019, 5, 12),
      location: "Kitchen — utility cupboard",
      warrantyUntil: at(2029, 5, 12),
      lastServiceAt: daysAgo(360),
      nextDueAt: monthsFromNow(1),
      sort: 0,
    },
  });

  await prisma.asset.createMany({
    data: [
      {
        clientId: demoClientId,
        propertyId: residence.id,
        kind: "Unvented cylinder",
        name: "Megaflo Eco 210",
        manufacturer: "Heatrae Sadia",
        model: "Megaflo Eco 210",
        serial: "ME210 998877",
        installDate: at(2019, 5, 12),
        location: "Airing cupboard",
        lastServiceAt: daysAgo(360),
        nextDueAt: monthsFromNow(1),
        sort: 1,
      },
      {
        clientId: demoClientId,
        propertyId: residence.id,
        kind: "Thermostat / programmer",
        name: "Nest Learning Thermostat",
        manufacturer: "Google Nest",
        model: "Learning Thermostat (3rd gen)",
        serial: "06AA01AC2B3C",
        installDate: at(2019, 6, 3),
        location: "Hallway",
        sort: 2,
      },
      {
        clientId: demoClientId,
        propertyId: riverside.id,
        kind: "Combi boiler",
        name: "Vaillant ecoTEC plus 832",
        manufacturer: "Vaillant",
        model: "ecoTEC plus 832",
        serial: "21 4455 6677 88",
        installDate: at(2021, 9, 2),
        location: "Kitchen cupboard",
        warrantyUntil: at(2031, 9, 2),
        lastServiceAt: daysAgo(200),
        nextDueAt: monthsFromNow(6),
        sort: 0,
      },
      {
        clientId: demoClientId,
        propertyId: riverside.id,
        kind: "Consumer unit / fuse board",
        name: "Hager 10-way consumer unit",
        manufacturer: "Hager",
        model: "VML910CURK",
        serial: "HG-10W-77213",
        installDate: at(2021, 9, 2),
        location: "Hallway cupboard",
        sort: 1,
      },
      {
        clientId: demoClientId,
        propertyId: holidayLet.id,
        kind: "Air source heat pump",
        name: "Daikin Altherma 3",
        manufacturer: "Daikin",
        model: "Altherma 3 EDLA08",
        serial: "DK-ALT3-55210",
        installDate: at(2023, 3, 14),
        location: "External — north wall",
        warrantyUntil: at(2028, 3, 14),
        lastServiceAt: daysAgo(120),
        nextDueAt: monthsFromNow(8),
        sort: 0,
      },
      {
        clientId: demoClientId,
        propertyId: holidayLet.id,
        kind: "MVHR unit",
        name: "Vent-Axia Sentinel Kinetic",
        manufacturer: "Vent-Axia",
        model: "Sentinel Kinetic Plus",
        serial: "VA-SKP-31108",
        installDate: at(2023, 3, 14),
        location: "Loft",
        nextDueAt: monthsFromNow(14),
        sort: 1,
      },
    ],
  });

  // ------------------------------------------------------------- Reminders
  await prisma.reminder.createMany({
    data: [
      {
        clientId: demoClientId,
        customerId: bob.id,
        propertyId: residence.id,
        assetId: boiler.id,
        kind: "ANNUAL_SERVICE",
        label: "Annual service — Boiler",
        dueAt: monthsFromNow(1),
        everyMonths: 12,
      },
      {
        clientId: demoClientId,
        customerId: bob.id,
        propertyId: residence.id,
        assetId: boiler.id,
        kind: "CERT_EXPIRY",
        label: "Certificate expiry — Boiler",
        dueAt: monthsFromNow(1),
        everyMonths: 12,
      },
      {
        clientId: demoClientId,
        customerId: bob.id,
        propertyId: riverside.id,
        kind: "CERT_EXPIRY",
        label: "Gas safety certificate — Riverside Flat",
        dueAt: monthsFromNow(3),
        everyMonths: 12,
      },
      {
        clientId: demoClientId,
        customerId: bob.id,
        propertyId: holidayLet.id,
        kind: "INSPECTION",
        label: "Heat pump inspection",
        dueAt: monthsFromNow(8),
        everyMonths: 24,
      },
    ],
  });

  // ----------------------------------------------------------------- Notes
  // Internal by default, and one customer-visible so the distinction the
  // wireframes make is actually visible on screen rather than theoretical.
  await prisma.customerNote.createMany({
    data: [
      {
        clientId: demoClientId,
        customerId: bob.id,
        propertyId: residence.id,
        type: "PROPERTY",
        body: "Access via side gate. Key safe on wall by porch. Dog is friendly but bark is loud.",
        pinned: true,
        visibility: "INTERNAL",
      },
      {
        clientId: demoClientId,
        customerId: bob.id,
        propertyId: residence.id,
        assetId: boiler.id,
        type: "PROPERTY",
        body: "Spoke to Bob about upgrading the cylinder thermostat. To follow up with options.",
        visibility: "INTERNAL",
      },
      {
        clientId: demoClientId,
        customerId: bob.id,
        type: "CUSTOMER",
        body: "Happy for us to hold a key. Sarah handles all invoicing — send nothing financial to Bob.",
        pinned: true,
        visibility: "INTERNAL",
      },
      {
        clientId: demoClientId,
        customerId: bob.id,
        propertyId: riverside.id,
        type: "PRIVATE",
        body: "Managing agent slow to pay last time — chase at 14 days, not 30.",
        visibility: "INTERNAL",
      },
      {
        clientId: demoClientId,
        customerId: bob.id,
        propertyId: residence.id,
        type: "CUSTOMER",
        body: "Annual service booked for next month. We'll text the morning before.",
        visibility: "CUSTOMER",
      },
    ],
  });

  // ----------------------------------------------------------------- Files
  await prisma.customerFile.createMany({
    data: [
      {
        clientId: demoClientId,
        customerId: bob.id,
        propertyId: residence.id,
        assetId: boiler.id,
        category: "CERTIFICATE",
        filename: "Gas Safety Certificate.pdf",
        url: "https://placehold.co/600x800/png?text=SEED+Gas+Safety",
        contentType: "application/pdf",
        sizeBytes: 331_776,
        issuedAt: daysAgo(360),
        expiresAt: monthsFromNow(1),
        visibility: "CUSTOMER",
      },
      {
        clientId: demoClientId,
        customerId: bob.id,
        propertyId: residence.id,
        assetId: boiler.id,
        category: "MANUAL",
        filename: "Greenstar 30i user manual.pdf",
        url: "https://placehold.co/600x800/png?text=SEED+Manual",
        contentType: "application/pdf",
        sizeBytes: 1_204_224,
      },
      {
        clientId: demoClientId,
        customerId: bob.id,
        propertyId: residence.id,
        assetId: boiler.id,
        category: "WARRANTY",
        filename: "Worcester 10yr warranty.pdf",
        url: "https://placehold.co/600x800/png?text=SEED+Warranty",
        contentType: "application/pdf",
        sizeBytes: 210_944,
        issuedAt: at(2019, 5, 12),
        expiresAt: at(2029, 5, 12),
      },
      {
        clientId: demoClientId,
        customerId: bob.id,
        propertyId: residence.id,
        category: "PHOTO",
        filename: "Key safe location.jpg",
        url: "https://placehold.co/400x300/png?text=SEED+Key+safe",
        contentType: "image/jpeg",
        sizeBytes: 88_064,
      },
      {
        clientId: demoClientId,
        customerId: bob.id,
        propertyId: riverside.id,
        category: "CERTIFICATE",
        filename: "Landlord gas safety - Riverside.pdf",
        url: "https://placehold.co/600x800/png?text=SEED+Landlord+Cert",
        contentType: "application/pdf",
        sizeBytes: 298_000,
        issuedAt: daysAgo(200),
        expiresAt: monthsFromNow(3),
        visibility: "CUSTOMER",
      },
      {
        clientId: demoClientId,
        customerId: bob.id,
        propertyId: holidayLet.id,
        category: "OTHER",
        filename: "Asbestos survey - The Barn.pdf",
        url: "https://placehold.co/600x800/png?text=SEED+Asbestos+Survey",
        contentType: "application/pdf",
        sizeBytes: 512_000,
        issuedAt: at(2023, 2, 20),
      },
    ],
  });

  // ------------------------------------------- Everyone else gets a record too
  // A job whose customer is null would be a permanent special case in every
  // screen below. Cheaper to give the other seed enquiries real records.
  const others: { key: keyof Ids["enquiryIds"]; name: string; phone: string; postcode: string; nickname: string; line1: string }[] = [
    { key: "alice", name: "Alice Seed", phone: "07000002001", postcode: "GU21 4BB", nickname: "Home", line1: "18 Oak Avenue" },
    { key: "cara", name: "Cara Seed", phone: "07000002003", postcode: "GU21 2DD", nickname: "Home", line1: "5 Willow Court" },
    { key: "dan", name: "Dan Seed", phone: "07000002004", postcode: "KT14 6EE", nickname: "Home", line1: "31 Beech Road" },
  ];

  for (const o of others) {
    const customer = await prisma.customer.create({
      data: {
        clientId: demoClientId,
        name: o.name,
        phone: o.phone,
        phoneKey: phoneKeyOf(o.phone),
        email: `${o.name.split(" ")[0]!.toLowerCase()}.seed@email.com`,
        billingPostcode: o.postcode,
        contacts: {
          create: {
            clientId: demoClientId,
            name: o.name,
            role: "OWNER",
            phone: o.phone,
            isPrimary: true,
          },
        },
        properties: {
          create: {
            clientId: demoClientId,
            nickname: o.nickname,
            addressLine1: o.line1,
            town: "Woking",
            postcode: o.postcode,
            occupancy: "OWNER_OCCUPIED",
            access: { create: { clientId: demoClientId } },
          },
        },
      },
      include: { properties: true },
    });

    await prisma.enquiry.update({
      where: { id: enquiryIds[o.key] },
      data: { customerId: customer.id, propertyId: customer.properties[0]?.id ?? null },
    });
  }

  // Bob's existing seeded job belongs to the residence.
  await prisma.enquiry.update({
    where: { id: enquiryIds.bob },
    data: { customerId: bob.id, propertyId: residence.id },
  });

  // Extra jobs so the per-property counts on the Properties tab are real rather
  // than every job piling onto one address.
  await prisma.enquiry.create({
    data: {
      clientId: demoClientId,
      customerId: bob.id,
      propertyId: residence.id,
      name: "Bob Seed",
      phone: bobPhone,
      message: "Annual boiler service — Worcester Greenstar 30i.",
      postcode: "GU22 8CC",
      source: "manual",
      status: "ROUTED",
      pipeline: "JOB",
      triage: "LIKELY_JOB",
      summary: "Annual boiler service",
      createdAt: daysAgo(2),
      promotedAt: daysAgo(2),
    },
  });

  await prisma.enquiry.create({
    data: {
      clientId: demoClientId,
      customerId: bob.id,
      propertyId: riverside.id,
      name: "James Taylor",
      phone: "07712334455",
      message: "Bathroom radiator not heating in the flat.",
      postcode: "GU1 4AB",
      source: "manual",
      status: "ROUTED",
      pipeline: "JOB",
      triage: "LIKELY_JOB",
      summary: "Bathroom radiator not heating",
      createdAt: daysAgo(1),
      promotedAt: daysAgo(1),
    },
  });

  // Invoices already seeded against Bob's enquiry should file under Bob.
  await prisma.invoice.updateMany({
    where: { clientId: demoClientId, enquiryId: enquiryIds.bob },
    data: { customerId: bob.id },
  });

  console.log(
    `  customers: 4 (Bob Seed with ${4} contacts, 3 properties, 7 assets, 4 reminders, 5 notes, 6 files)`
  );
}
