import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { ApiError } from "../middleware/error.js";
import { idempotent } from "../middleware/idempotency.js";
import { requireClient, clientId } from "./tradie.js";
import { appendJobEvent } from "../services/jobs/events.js";
import { storeCertFile } from "../services/storage/store.js";
import {
  accessSelect,
  assetSelect,
  contactSelect,
  findCustomer,
  getCustomerActivity,
  getCustomerBilling,
  getCustomerJobs,
  getCustomerRecord,
  listCustomers,
  maskAccess,
  setPrimaryContact,
} from "../services/customers/record.js";
import {
  ensureAssetTypes,
  listAssetTypes,
  setAssetTypeActive,
  upsertAssetType,
} from "../services/assets/assetTypes.js";

export const customerRouter = Router();

/**
 * Customer, contact, property, asset, file, note and reminder routes.
 *
 * Mounted ahead of tradieRouter on /api/t. Writes accept a client-minted `id` and
 * are wrapped in `idempotent`, because every one of these can be made in a van
 * with no signal and replayed later — a retried "add property" must not leave the
 * tradie with the same address twice.
 */

function ownedCustomer(req: Parameters<typeof clientId>[0], id: string) {
  return prisma.customer.findFirst({ where: { id, clientId: clientId(req) } });
}

const CHANNELS = ["CALL", "SMS", "EMAIL", "WHATSAPP"] as const;
const ROLES = ["OWNER", "TENANT", "SITE_CONTACT", "ACCOUNTS", "PROPERTY_MANAGER"] as const;
const OCCUPANCY = ["OWNER_OCCUPIED", "TENANTED", "EMPTY"] as const;
const CATEGORIES = ["CERTIFICATE", "MANUAL", "WARRANTY", "PHOTO", "INVOICE", "OTHER"] as const;
const NOTE_TYPES = ["CUSTOMER", "PROPERTY", "JOB", "PRIVATE"] as const;
const VISIBILITY = ["INTERNAL", "CUSTOMER"] as const;

const customerSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["INDIVIDUAL", "COMPANY"]).optional(),
  name: z.string().min(1).max(200),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  preferredChannel: z.enum(CHANNELS).optional(),
  billingAddress: z.string().max(400).nullable().optional(),
  billingPostcode: z.string().max(20).nullable().optional(),
  tags: z.array(z.string().max(40)).max(12).optional(),
  paymentTerms: z.string().max(120).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

const contactSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(160),
  role: z.enum(ROLES).optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  isPrimary: z.boolean().optional(),
  receivesQuotes: z.boolean().optional(),
  receivesInvoices: z.boolean().optional(),
  receivesAppointments: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
  sort: z.number().int().optional(),
});

const propertySchema = z.object({
  id: z.string().optional(),
  nickname: z.string().max(120).nullable().optional(),
  addressLine1: z.string().max(200).nullable().optional(),
  addressLine2: z.string().max(200).nullable().optional(),
  town: z.string().max(120).nullable().optional(),
  postcode: z.string().max(20).nullable().optional(),
  propertyType: z.string().max(80).nullable().optional(),
  occupancy: z.enum(OCCUPANCY).nullable().optional(),
  siteContactId: z.string().nullable().optional(),
  billToCustomerId: z.string().nullable().optional(),
  sort: z.number().int().optional(),
});

const accessSchema = z.object({
  accessMethod: z.string().max(80).nullable().optional(),
  keySafe: z.boolean().optional(),
  keySafeLocation: z.string().max(200).nullable().optional(),
  accessCode: z.string().max(60).nullable().optional(),
  alarm: z.boolean().optional(),
  parking: z.string().max(120).nullable().optional(),
  permitRequired: z.boolean().optional(),
  workingHoursFrom: z.string().max(10).nullable().optional(),
  workingHoursTo: z.string().max(10).nullable().optional(),
  callBeforeArrival: z.boolean().optional(),
  dogOnSite: z.boolean().optional(),
  asbestosKnown: z.boolean().optional(),
  safetyFlags: z.array(z.string().max(40)).max(12).optional(),
  engineerNotes: z.string().max(4000).nullable().optional(),
});

const isoDate = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v ? new Date(v) : null));

const assetSchema = z.object({
  id: z.string().optional(),
  kind: z.string().min(1).max(80),
  name: z.string().max(160).nullable().optional(),
  manufacturer: z.string().max(120).nullable().optional(),
  model: z.string().max(120).nullable().optional(),
  serial: z.string().max(120).nullable().optional(),
  installDate: isoDate,
  location: z.string().max(160).nullable().optional(),
  warrantyUntil: isoDate,
  lastServiceAt: isoDate,
  nextDueAt: isoDate,
  notes: z.string().max(4000).nullable().optional(),
  sort: z.number().int().optional(),
});

/* ------------------------------------------------------------------ customers */

customerRouter.get("/customers", requireClient, async (req, res, next) => {
  try {
    res.json(await listCustomers(clientId(req)));
  } catch (err) {
    next(err);
  }
});

customerRouter.get("/customers/:id", requireClient, async (req, res, next) => {
  try {
    const record = await getCustomerRecord(clientId(req), req.params.id);
    if (!record) throw new ApiError(404, "not_found", "Customer not found");
    res.json(record);
  } catch (err) {
    next(err);
  }
});

customerRouter.post("/customers", requireClient, idempotent(async (req, res, next) => {
  try {
    const body = customerSchema.parse(req.body ?? {});
    const cid = clientId(req);
    const phoneKey = body.phone ? body.phone.replace(/\D/g, "").slice(-10) || null : null;

    // Upsert on the client-minted id so a queued create replayed after it already
    // landed updates rather than making a second customer.
    const existing = body.id ? await prisma.customer.findFirst({ where: { id: body.id, clientId: cid } }) : null;
    const data = {
      type: body.type ?? "INDIVIDUAL",
      name: body.name.trim(),
      phone: body.phone ?? null,
      phoneKey,
      email: body.email ?? null,
      preferredChannel: body.preferredChannel ?? "CALL",
      billingAddress: body.billingAddress ?? null,
      billingPostcode: body.billingPostcode ?? null,
      tags: body.tags ?? [],
      paymentTerms: body.paymentTerms ?? null,
      notes: body.notes ?? null,
    };

    if (existing) {
      res.json(await prisma.customer.update({ where: { id: existing.id }, data }));
      return;
    }

    const created = await prisma.customer.create({
      data: {
        ...(body.id ? { id: body.id } : {}),
        clientId: cid,
        ...data,
        // The record is useless without someone to ring, and the wireframe's
        // first step only asks for one name — so it becomes the primary contact.
        contacts: {
          create: {
            clientId: cid,
            name: body.name.trim(),
            role: "OWNER",
            phone: body.phone ?? null,
            email: body.email ?? null,
            isPrimary: true,
          },
        },
      },
      include: { contacts: { select: contactSelect } },
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}));

customerRouter.patch("/customers/:id", requireClient, idempotent(async (req, res, next) => {
  try {
    const owned = await ownedCustomer(req, req.params.id);
    if (!owned) throw new ApiError(404, "not_found", "Customer not found");
    const body = customerSchema.partial().parse(req.body ?? {});
    const phoneKey =
      body.phone !== undefined ? (body.phone ? body.phone.replace(/\D/g, "").slice(-10) || null : null) : undefined;
    res.json(
      await prisma.customer.update({
        where: { id: owned.id },
        data: {
          ...(body.type !== undefined ? { type: body.type } : {}),
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.phone !== undefined ? { phone: body.phone } : {}),
          ...(phoneKey !== undefined ? { phoneKey } : {}),
          ...(body.email !== undefined ? { email: body.email } : {}),
          ...(body.preferredChannel !== undefined ? { preferredChannel: body.preferredChannel } : {}),
          ...(body.billingAddress !== undefined ? { billingAddress: body.billingAddress } : {}),
          ...(body.billingPostcode !== undefined ? { billingPostcode: body.billingPostcode } : {}),
          ...(body.tags !== undefined ? { tags: body.tags } : {}),
          ...(body.paymentTerms !== undefined ? { paymentTerms: body.paymentTerms } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
        },
      })
    );
  } catch (err) {
    next(err);
  }
}));

customerRouter.delete("/customers/:id", requireClient, idempotent(async (req, res, next) => {
  try {
    const owned = await ownedCustomer(req, req.params.id);
    // A replayed delete finds nothing; saying "already gone" beats a 404 that the
    // outbox would park as a permanent failure.
    if (!owned) {
      res.json({ ok: true, alreadyDeleted: true });
      return;
    }
    await prisma.customer.delete({ where: { id: owned.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}));

customerRouter.get("/customers/:id/activity", requireClient, async (req, res, next) => {
  try {
    const owned = await findCustomer(clientId(req), req.params.id);
    if (!owned) throw new ApiError(404, "not_found", "Customer not found");
    res.json(await getCustomerActivity(clientId(req), owned.id));
  } catch (err) {
    next(err);
  }
});

customerRouter.get("/customers/:id/jobs", requireClient, async (req, res, next) => {
  try {
    const owned = await findCustomer(clientId(req), req.params.id);
    if (!owned) throw new ApiError(404, "not_found", "Customer not found");
    res.json(await getCustomerJobs(clientId(req), owned.id));
  } catch (err) {
    next(err);
  }
});

customerRouter.get("/customers/:id/billing", requireClient, async (req, res, next) => {
  try {
    const owned = await findCustomer(clientId(req), req.params.id);
    if (!owned) throw new ApiError(404, "not_found", "Customer not found");
    res.json(await getCustomerBilling(clientId(req), owned.id));
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------- contacts */

customerRouter.post("/customers/:id/contacts", requireClient, idempotent(async (req, res, next) => {
  try {
    const owned = await ownedCustomer(req, req.params.id);
    if (!owned) throw new ApiError(404, "not_found", "Customer not found");
    const body = contactSchema.parse(req.body ?? {});
    const cid = clientId(req);

    const existing = body.id ? await prisma.contact.findFirst({ where: { id: body.id, clientId: cid } }) : null;
    if (existing) {
      res.json(await prisma.contact.update({ where: { id: existing.id }, data: { ...body, id: undefined } }));
      return;
    }

    const count = await prisma.contact.count({ where: { customerId: owned.id } });
    const created = await prisma.contact.create({
      data: {
        ...(body.id ? { id: body.id } : {}),
        clientId: cid,
        customerId: owned.id,
        name: body.name.trim(),
        role: body.role ?? "OWNER",
        phone: body.phone ?? null,
        email: body.email ?? null,
        // First contact on a customer is the primary by default, whatever was asked.
        isPrimary: count === 0 ? true : (body.isPrimary ?? false),
        receivesQuotes: body.receivesQuotes ?? true,
        receivesInvoices: body.receivesInvoices ?? true,
        receivesAppointments: body.receivesAppointments ?? true,
        notes: body.notes ?? null,
        sort: body.sort ?? count,
      },
      select: contactSelect,
    });
    if (body.isPrimary && count > 0) await setPrimaryContact(cid, created.id);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}));

customerRouter.patch("/contacts/:id", requireClient, idempotent(async (req, res, next) => {
  try {
    const cid = clientId(req);
    const owned = await prisma.contact.findFirst({ where: { id: req.params.id, clientId: cid } });
    if (!owned) throw new ApiError(404, "not_found", "Contact not found");
    const body = contactSchema.partial().parse(req.body ?? {});
    if (body.isPrimary) await setPrimaryContact(cid, owned.id);
    res.json(
      await prisma.contact.update({
        where: { id: owned.id },
        data: { ...body, id: undefined, isPrimary: undefined },
        select: contactSelect,
      })
    );
  } catch (err) {
    next(err);
  }
}));

customerRouter.post("/contacts/:id/primary", requireClient, idempotent(async (req, res, next) => {
  try {
    const updated = await setPrimaryContact(clientId(req), req.params.id);
    if (!updated) throw new ApiError(404, "not_found", "Contact not found");
    res.json(updated);
  } catch (err) {
    next(err);
  }
}));

customerRouter.delete("/contacts/:id", requireClient, idempotent(async (req, res, next) => {
  try {
    const owned = await prisma.contact.findFirst({ where: { id: req.params.id, clientId: clientId(req) } });
    if (!owned) {
      res.json({ ok: true, alreadyDeleted: true });
      return;
    }
    await prisma.contact.delete({ where: { id: owned.id } });
    // Never leave a customer with no primary — promote whoever is next in order.
    const remaining = await prisma.contact.findFirst({
      where: { customerId: owned.customerId },
      orderBy: { sort: "asc" },
    });
    if (remaining && owned.isPrimary) {
      await prisma.contact.update({ where: { id: remaining.id }, data: { isPrimary: true } });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}));

/* ----------------------------------------------------------------- properties */

customerRouter.post("/customers/:id/properties", requireClient, idempotent(async (req, res, next) => {
  try {
    const owned = await ownedCustomer(req, req.params.id);
    if (!owned) throw new ApiError(404, "not_found", "Customer not found");
    const body = propertySchema.parse(req.body ?? {});
    const cid = clientId(req);

    const existing = body.id ? await prisma.property.findFirst({ where: { id: body.id, clientId: cid } }) : null;
    if (existing) {
      res.json(await prisma.property.update({ where: { id: existing.id }, data: { ...body, id: undefined } }));
      return;
    }

    const count = await prisma.property.count({ where: { customerId: owned.id } });
    const created = await prisma.property.create({
      data: {
        ...(body.id ? { id: body.id } : {}),
        clientId: cid,
        customerId: owned.id,
        nickname: body.nickname ?? null,
        addressLine1: body.addressLine1 ?? null,
        addressLine2: body.addressLine2 ?? null,
        town: body.town ?? null,
        postcode: body.postcode ?? null,
        propertyType: body.propertyType ?? null,
        occupancy: body.occupancy ?? null,
        siteContactId: body.siteContactId ?? null,
        billToCustomerId: body.billToCustomerId ?? null,
        sort: body.sort ?? count,
        // Always give a property an access row. A tradie shouldn't have to
        // "create access details" before recording that there's a dog.
        access: { create: { clientId: cid } },
      },
      include: { access: { select: accessSelect }, assets: { select: assetSelect } },
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}));

customerRouter.get("/properties/:id", requireClient, async (req, res, next) => {
  try {
    const property = await prisma.property.findFirst({
      where: { id: req.params.id, clientId: clientId(req) },
      include: {
        access: { select: { ...accessSelect, accessCode: true } },
        assets: { orderBy: { sort: "asc" }, select: assetSelect },
        siteContact: { select: contactSelect },
        customer: { select: { id: true, name: true, phone: true } },
        files: { orderBy: { createdAt: "desc" } },
        propertyNotes: { orderBy: [{ pinned: "desc" }, { createdAt: "desc" }] },
        reminders: { where: { active: true }, orderBy: { dueAt: "asc" } },
        _count: { select: { enquiries: true } },
      },
    });
    if (!property) throw new ApiError(404, "not_found", "Property not found");
    res.json({ ...property, access: maskAccess(property.access), openJobCount: property._count.enquiries });
  } catch (err) {
    next(err);
  }
});

customerRouter.patch("/properties/:id", requireClient, idempotent(async (req, res, next) => {
  try {
    const owned = await prisma.property.findFirst({ where: { id: req.params.id, clientId: clientId(req) } });
    if (!owned) throw new ApiError(404, "not_found", "Property not found");
    const body = propertySchema.partial().parse(req.body ?? {});
    res.json(await prisma.property.update({ where: { id: owned.id }, data: { ...body, id: undefined } }));
  } catch (err) {
    next(err);
  }
}));

customerRouter.delete("/properties/:id", requireClient, idempotent(async (req, res, next) => {
  try {
    const owned = await prisma.property.findFirst({ where: { id: req.params.id, clientId: clientId(req) } });
    if (!owned) {
      res.json({ ok: true, alreadyDeleted: true });
      return;
    }
    await prisma.property.delete({ where: { id: owned.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}));

customerRouter.put("/properties/:id/access", requireClient, idempotent(async (req, res, next) => {
  try {
    const cid = clientId(req);
    const owned = await prisma.property.findFirst({ where: { id: req.params.id, clientId: cid } });
    if (!owned) throw new ApiError(404, "not_found", "Property not found");
    const body = accessSchema.parse(req.body ?? {});
    const saved = await prisma.propertyAccess.upsert({
      where: { propertyId: owned.id },
      create: { clientId: cid, propertyId: owned.id, ...body },
      update: body,
      select: { ...accessSelect, accessCode: true },
    });
    res.json(maskAccess(saved));
  } catch (err) {
    next(err);
  }
}));

/**
 * Reveal the access code.
 *
 * Its own endpoint on purpose. The code is the key to someone's house, so it is
 * never included in a list or detail payload — asking for it has to be a distinct
 * act. Once staff logins exist this is the single place that needs to write an
 * audit row; today there is only one login, so there is nobody to attribute it to
 * and pretending otherwise would be theatre.
 */
/**
 * Hand over one access code, and write down that it happened.
 *
 * Separate from the property payload on purpose: the code is never sent with the
 * record, so revealing it is a deliberate act rather than something anyone can
 * scrape out of a response they were already getting. That is also what makes
 * the audit meaningful — a row here means somebody asked, not that a screen
 * happened to load.
 */
customerRouter.post("/properties/:id/access/reveal", requireClient, async (req, res, next) => {
  try {
    const cid = clientId(req);
    const body = z.object({ jobId: z.string().optional() }).parse(req.body ?? {});
    const owned = await prisma.property.findFirst({
      where: { id: req.params.id, clientId: cid },
      include: { access: { select: { accessCode: true } } },
    });
    if (!owned) throw new ApiError(404, "not_found", "Property not found");

    // Only the job's own client can attribute a reveal to it.
    const job = body.jobId
      ? await prisma.job.findFirst({ where: { id: body.jobId, clientId: cid }, select: { id: true } })
      : null;

    const client = await prisma.client.findUnique({
      where: { id: cid },
      select: { businessName: true },
    });

    await prisma.accessReveal.create({
      data: {
        clientId: cid,
        propertyId: owned.id,
        jobId: job?.id ?? null,
        // One login per account today, so this is the account. When engineer
        // logins land it becomes the person, and the history already exists.
        actorLabel: client?.businessName || "Account holder",
      },
    });

    if (job) {
      await appendJobEvent(prisma, {
        clientId: cid,
        jobId: job.id,
        type: "access.revealed",
        summary: "Access code revealed",
        payload: { propertyId: owned.id },
      });
    }

    res.json({ accessCode: owned.access?.accessCode ?? null });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------------- assets */

customerRouter.get("/asset-types", requireClient, async (req, res, next) => {
  try {
    res.json(await listAssetTypes(clientId(req)));
  } catch (err) {
    next(err);
  }
});

customerRouter.post("/asset-types", requireClient, idempotent(async (req, res, next) => {
  try {
    const body = z
      .object({
        label: z.string().min(1).max(80),
        group: z.string().max(20).optional(),
        defaultServiceMonths: z.number().int().min(0).max(600).nullable().optional(),
      })
      .parse(req.body ?? {});
    await ensureAssetTypes(clientId(req));
    res.status(201).json(await upsertAssetType(clientId(req), body));
  } catch (err) {
    next(err);
  }
}));

customerRouter.patch("/asset-types/:id", requireClient, idempotent(async (req, res, next) => {
  try {
    const body = z.object({ active: z.boolean() }).parse(req.body ?? {});
    const updated = await setAssetTypeActive(clientId(req), req.params.id, body.active);
    if (!updated) throw new ApiError(404, "not_found", "Asset type not found");
    res.json(updated);
  } catch (err) {
    next(err);
  }
}));

customerRouter.post("/properties/:id/assets", requireClient, idempotent(async (req, res, next) => {
  try {
    const cid = clientId(req);
    const property = await prisma.property.findFirst({ where: { id: req.params.id, clientId: cid } });
    if (!property) throw new ApiError(404, "not_found", "Property not found");
    const body = assetSchema.parse(req.body ?? {});

    const existing = body.id ? await prisma.asset.findFirst({ where: { id: body.id, clientId: cid } }) : null;
    if (existing) {
      res.json(
        await prisma.asset.update({ where: { id: existing.id }, data: { ...body, id: undefined }, select: assetSelect })
      );
      return;
    }

    // No next-due given? Derive it from the type's interval. The whole repeat
    // business case rests on that date existing, and a tradie adding a boiler on
    // a doorstep will not stop to work out what twelve months from now is.
    let nextDueAt = body.nextDueAt;
    if (!nextDueAt) {
      const type = await prisma.assetType.findFirst({
        where: { clientId: cid, label: { equals: body.kind, mode: "insensitive" } },
      });
      if (type?.defaultServiceMonths) {
        const from = body.lastServiceAt ?? body.installDate ?? new Date();
        const due = new Date(from);
        due.setMonth(due.getMonth() + type.defaultServiceMonths);
        nextDueAt = due;
      }
    }

    const count = await prisma.asset.count({ where: { propertyId: property.id } });
    const created = await prisma.asset.create({
      data: {
        ...(body.id ? { id: body.id } : {}),
        clientId: cid,
        propertyId: property.id,
        kind: body.kind,
        name: body.name ?? null,
        manufacturer: body.manufacturer ?? null,
        model: body.model ?? null,
        serial: body.serial ?? null,
        installDate: body.installDate,
        location: body.location ?? null,
        warrantyUntil: body.warrantyUntil,
        lastServiceAt: body.lastServiceAt,
        nextDueAt,
        notes: body.notes ?? null,
        sort: body.sort ?? count,
      },
      select: assetSelect,
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}));

customerRouter.patch("/assets/:id", requireClient, idempotent(async (req, res, next) => {
  try {
    const owned = await prisma.asset.findFirst({ where: { id: req.params.id, clientId: clientId(req) } });
    if (!owned) throw new ApiError(404, "not_found", "Asset not found");
    const body = assetSchema.partial().parse(req.body ?? {});
    res.json(
      await prisma.asset.update({ where: { id: owned.id }, data: { ...body, id: undefined }, select: assetSelect })
    );
  } catch (err) {
    next(err);
  }
}));

customerRouter.delete("/assets/:id", requireClient, idempotent(async (req, res, next) => {
  try {
    const owned = await prisma.asset.findFirst({ where: { id: req.params.id, clientId: clientId(req) } });
    if (!owned) {
      res.json({ ok: true, alreadyDeleted: true });
      return;
    }
    await prisma.asset.delete({ where: { id: owned.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}));

/* ---------------------------------------------------------------------- notes */

customerRouter.post("/customers/:id/notes", requireClient, idempotent(async (req, res, next) => {
  try {
    const owned = await ownedCustomer(req, req.params.id);
    if (!owned) throw new ApiError(404, "not_found", "Customer not found");
    const body = z
      .object({
        id: z.string().optional(),
        type: z.enum(NOTE_TYPES).optional(),
        body: z.string().min(1).max(8000),
        pinned: z.boolean().optional(),
        visibility: z.enum(VISIBILITY).optional(),
        propertyId: z.string().nullable().optional(),
        assetId: z.string().nullable().optional(),
        enquiryId: z.string().nullable().optional(),
      })
      .parse(req.body ?? {});
    const cid = clientId(req);

    const existing = body.id ? await prisma.customerNote.findFirst({ where: { id: body.id, clientId: cid } }) : null;
    if (existing) {
      res.json(await prisma.customerNote.update({ where: { id: existing.id }, data: { ...body, id: undefined } }));
      return;
    }

    res.status(201).json(
      await prisma.customerNote.create({
        data: {
          ...(body.id ? { id: body.id } : {}),
          clientId: cid,
          customerId: owned.id,
          propertyId: body.propertyId ?? null,
          assetId: body.assetId ?? null,
          enquiryId: body.enquiryId ?? null,
          type: body.type ?? "CUSTOMER",
          body: body.body,
          pinned: body.pinned ?? false,
          // Internal unless someone says otherwise. Costs and engineer notes
          // leaking to a customer is the failure that matters here.
          visibility: body.visibility ?? "INTERNAL",
        },
      })
    );
  } catch (err) {
    next(err);
  }
}));

customerRouter.patch("/notes/:id", requireClient, idempotent(async (req, res, next) => {
  try {
    const owned = await prisma.customerNote.findFirst({ where: { id: req.params.id, clientId: clientId(req) } });
    if (!owned) throw new ApiError(404, "not_found", "Note not found");
    const body = z
      .object({
        body: z.string().min(1).max(8000).optional(),
        pinned: z.boolean().optional(),
        visibility: z.enum(VISIBILITY).optional(),
        type: z.enum(NOTE_TYPES).optional(),
      })
      .parse(req.body ?? {});
    res.json(await prisma.customerNote.update({ where: { id: owned.id }, data: body }));
  } catch (err) {
    next(err);
  }
}));

customerRouter.delete("/notes/:id", requireClient, idempotent(async (req, res, next) => {
  try {
    const owned = await prisma.customerNote.findFirst({ where: { id: req.params.id, clientId: clientId(req) } });
    if (!owned) {
      res.json({ ok: true, alreadyDeleted: true });
      return;
    }
    await prisma.customerNote.delete({ where: { id: owned.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}));

/* ---------------------------------------------------------------------- files */

customerRouter.post("/customers/:id/files", requireClient, idempotent(async (req, res, next) => {
  try {
    const owned = await ownedCustomer(req, req.params.id);
    if (!owned) throw new ApiError(404, "not_found", "Customer not found");
    const body = z
      .object({
        id: z.string().optional(),
        category: z.enum(CATEGORIES).optional(),
        filename: z.string().min(1).max(200),
        contentType: z.string().max(120).optional(),
        dataBase64: z.string().min(1),
        propertyId: z.string().nullable().optional(),
        assetId: z.string().nullable().optional(),
        enquiryId: z.string().nullable().optional(),
        issuedAt: isoDate,
        expiresAt: isoDate,
        visibility: z.enum(VISIBILITY).optional(),
      })
      .parse(req.body ?? {});
    const cid = clientId(req);

    // storeCertFile, not storeImage: the categories here are certificates,
    // manuals and warranties, and storeImage rejects PDFs outright.
    const buffer = Buffer.from(body.dataBase64, "base64");
    const stored = await storeCertFile(body.contentType || "application/pdf", buffer);

    res.status(201).json(
      await prisma.customerFile.create({
        data: {
          ...(body.id ? { id: body.id } : {}),
          clientId: cid,
          customerId: owned.id,
          propertyId: body.propertyId ?? null,
          assetId: body.assetId ?? null,
          enquiryId: body.enquiryId ?? null,
          category: body.category ?? "OTHER",
          filename: body.filename,
          url: stored.url,
          contentType: body.contentType ?? null,
          sizeBytes: buffer.byteLength,
          issuedAt: body.issuedAt,
          expiresAt: body.expiresAt,
          visibility: body.visibility ?? "INTERNAL",
        },
      })
    );
  } catch (err) {
    next(err);
  }
}));

customerRouter.delete("/files/:id", requireClient, idempotent(async (req, res, next) => {
  try {
    const owned = await prisma.customerFile.findFirst({ where: { id: req.params.id, clientId: clientId(req) } });
    if (!owned) {
      res.json({ ok: true, alreadyDeleted: true });
      return;
    }
    await prisma.customerFile.delete({ where: { id: owned.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}));

/* ------------------------------------------------------------------ reminders */

customerRouter.post("/customers/:id/reminders", requireClient, idempotent(async (req, res, next) => {
  try {
    const owned = await ownedCustomer(req, req.params.id);
    if (!owned) throw new ApiError(404, "not_found", "Customer not found");
    const body = z
      .object({
        id: z.string().optional(),
        kind: z.string().max(40).optional(),
        label: z.string().min(1).max(160),
        dueAt: z.string(),
        everyMonths: z.number().int().min(0).max(600).nullable().optional(),
        propertyId: z.string().nullable().optional(),
        assetId: z.string().nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body ?? {});
    const cid = clientId(req);

    const existing = body.id ? await prisma.reminder.findFirst({ where: { id: body.id, clientId: cid } }) : null;
    const data = {
      kind: body.kind ?? "OTHER",
      label: body.label,
      dueAt: new Date(body.dueAt),
      everyMonths: body.everyMonths ?? null,
      propertyId: body.propertyId ?? null,
      assetId: body.assetId ?? null,
      active: body.active ?? true,
    };
    if (existing) {
      res.json(await prisma.reminder.update({ where: { id: existing.id }, data }));
      return;
    }
    res.status(201).json(
      await prisma.reminder.create({
        data: { ...(body.id ? { id: body.id } : {}), clientId: cid, customerId: owned.id, ...data },
      })
    );
  } catch (err) {
    next(err);
  }
}));

customerRouter.patch("/reminders/:id", requireClient, idempotent(async (req, res, next) => {
  try {
    const owned = await prisma.reminder.findFirst({ where: { id: req.params.id, clientId: clientId(req) } });
    if (!owned) throw new ApiError(404, "not_found", "Reminder not found");
    const body = z
      .object({
        label: z.string().min(1).max(160).optional(),
        dueAt: z.string().optional(),
        everyMonths: z.number().int().min(0).max(600).nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body ?? {});
    res.json(
      await prisma.reminder.update({
        where: { id: owned.id },
        data: { ...body, dueAt: body.dueAt ? new Date(body.dueAt) : undefined },
      })
    );
  } catch (err) {
    next(err);
  }
}));

customerRouter.delete("/reminders/:id", requireClient, idempotent(async (req, res, next) => {
  try {
    const owned = await prisma.reminder.findFirst({ where: { id: req.params.id, clientId: clientId(req) } });
    if (!owned) {
      res.json({ ok: true, alreadyDeleted: true });
      return;
    }
    await prisma.reminder.delete({ where: { id: owned.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}));
