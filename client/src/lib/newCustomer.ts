import type { QueryClient } from "@tanstack/react-query";
import { sendOrQueue } from "../api/tradie";
import type {
  AssetDto,
  ContactDto,
  CustomerRecord,
  PropertyDto,
} from "../api/customers";
import { newOutboxId } from "./outbox";

/**
 * Customer-record writes that survive no signal.
 *
 * Same shape as startQuote / startTemplate / createRate: the phone mints the id,
 * the change lands in the cached record immediately so the next screen can read
 * it, and the write queues. The server upserts on that id, so a replayed create
 * updates rather than leaving the tradie with the same property twice.
 *
 * This matters more here than anywhere else in the app. Adding a property, its
 * access details and the boiler in the cupboard is exactly what a tradie does
 * while standing in the cupboard, which is exactly where there is no signal.
 */

const KEY = (id: string) => ["tradie-customer", id];

function patchRecord(qc: QueryClient, customerId: string, fn: (prev: CustomerRecord) => CustomerRecord) {
  qc.setQueryData<CustomerRecord>(KEY(customerId), (prev) => (prev ? fn(prev) : prev));
}

export type CustomerDraft = {
  type?: "INDIVIDUAL" | "COMPANY";
  name: string;
  phone?: string | null;
  email?: string | null;
  preferredChannel?: "CALL" | "SMS" | "EMAIL" | "WHATSAPP";
  billingAddress?: string | null;
  billingPostcode?: string | null;
  tags?: string[];
  paymentTerms?: string | null;
  notes?: string | null;
};

export async function createCustomer(qc: QueryClient, draft: CustomerDraft): Promise<string> {
  const id = newOutboxId();

  // Seeded so the add flow's later steps have something to attach to before the
  // server has ever heard of this customer.
  const optimistic: CustomerRecord = {
    id,
    type: draft.type ?? "INDIVIDUAL",
    name: draft.name,
    phone: draft.phone ?? null,
    phoneKey: draft.phone ? draft.phone.replace(/\D/g, "").slice(-10) : null,
    email: draft.email ?? null,
    preferredChannel: draft.preferredChannel ?? "CALL",
    billingAddress: draft.billingAddress ?? null,
    billingPostcode: draft.billingPostcode ?? null,
    tags: draft.tags ?? [],
    paymentTerms: draft.paymentTerms ?? null,
    notes: draft.notes ?? null,
    contacts: [
      {
        id: `${id}-c0`,
        name: draft.name,
        role: "OWNER",
        phone: draft.phone ?? null,
        email: draft.email ?? null,
        isPrimary: true,
        receivesQuotes: true,
        receivesInvoices: true,
        receivesAppointments: true,
        notes: null,
        sort: 0,
      },
    ],
    properties: [],
    customerNotes: [],
    files: [],
    reminders: [],
    summary: {
      outstandingPence: 0,
      outstandingCount: 0,
      overdueCount: 0,
      paidPence: 0,
      openJobs: 0,
      openJobValuePence: 0,
      draftQuotes: 0,
      draftQuoteValuePence: 0,
      nextAppointment: null,
    },
  };
  qc.setQueryData(KEY(id), optimistic);

  await sendOrQueue({
    label: `New customer · ${draft.name}`,
    path: "/customers",
    method: "POST",
    body: { id, ...draft },
    invalidates: ["tradie-customers", "tradie-customer"],
  });

  return id;
}

export async function saveCustomer(qc: QueryClient, id: string, patch: Partial<CustomerDraft>): Promise<void> {
  patchRecord(qc, id, (prev) => ({ ...prev, ...patch } as CustomerRecord));
  await sendOrQueue({
    label: `Customer · ${patch.name || "update"}`,
    path: `/customers/${id}`,
    method: "PATCH",
    body: patch,
    invalidates: ["tradie-customers", "tradie-customer"],
  });
}

export type ContactDraft = {
  name: string;
  role?: ContactDto["role"];
  phone?: string | null;
  email?: string | null;
  isPrimary?: boolean;
  receivesQuotes?: boolean;
  receivesInvoices?: boolean;
  receivesAppointments?: boolean;
  notes?: string | null;
};

export async function createContact(qc: QueryClient, customerId: string, draft: ContactDraft): Promise<string> {
  const id = newOutboxId();
  patchRecord(qc, customerId, (prev) => ({
    ...prev,
    contacts: [
      ...prev.contacts.map((c) => (draft.isPrimary ? { ...c, isPrimary: false } : c)),
      {
        id,
        name: draft.name,
        role: draft.role ?? "OWNER",
        phone: draft.phone ?? null,
        email: draft.email ?? null,
        isPrimary: draft.isPrimary ?? prev.contacts.length === 0,
        receivesQuotes: draft.receivesQuotes ?? true,
        receivesInvoices: draft.receivesInvoices ?? true,
        receivesAppointments: draft.receivesAppointments ?? true,
        notes: draft.notes ?? null,
        sort: prev.contacts.length,
      },
    ],
  }));

  await sendOrQueue({
    label: `Contact · ${draft.name}`,
    path: `/customers/${customerId}/contacts`,
    method: "POST",
    body: { id, ...draft },
    invalidates: ["tradie-customer"],
  });
  return id;
}

export async function saveContact(
  qc: QueryClient,
  customerId: string,
  contactId: string,
  patch: Partial<ContactDraft>
): Promise<void> {
  patchRecord(qc, customerId, (prev) => ({
    ...prev,
    contacts: prev.contacts.map((c) =>
      c.id === contactId
        ? { ...c, ...patch }
        : patch.isPrimary
          ? { ...c, isPrimary: false }
          : c
    ),
  }));
  await sendOrQueue({
    label: `Contact · ${patch.name || "update"}`,
    path: `/contacts/${contactId}`,
    method: "PATCH",
    body: patch,
    invalidates: ["tradie-customer"],
  });
}

export async function deleteContact(qc: QueryClient, customerId: string, contactId: string): Promise<void> {
  patchRecord(qc, customerId, (prev) => ({
    ...prev,
    contacts: prev.contacts.filter((c) => c.id !== contactId),
  }));
  await sendOrQueue({
    label: "Remove contact",
    path: `/contacts/${contactId}`,
    method: "DELETE",
    body: {},
    invalidates: ["tradie-customer"],
  });
}

export type PropertyDraft = {
  nickname?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  town?: string | null;
  postcode?: string | null;
  propertyType?: string | null;
  occupancy?: PropertyDto["occupancy"];
  siteContactId?: string | null;
  billToCustomerId?: string | null;
};

export async function createProperty(qc: QueryClient, customerId: string, draft: PropertyDraft): Promise<string> {
  const id = newOutboxId();
  patchRecord(qc, customerId, (prev) => ({
    ...prev,
    properties: [
      ...prev.properties,
      {
        id,
        customerId,
        nickname: draft.nickname ?? null,
        addressLine1: draft.addressLine1 ?? null,
        addressLine2: draft.addressLine2 ?? null,
        town: draft.town ?? null,
        postcode: draft.postcode ?? null,
        propertyType: draft.propertyType ?? null,
        occupancy: draft.occupancy ?? null,
        siteContactId: draft.siteContactId ?? null,
        billToCustomerId: draft.billToCustomerId ?? null,
        sort: prev.properties.length,
        access: null,
        assets: [],
        openJobCount: 0,
      },
    ],
  }));

  await sendOrQueue({
    label: `Property · ${draft.nickname || draft.postcode || "new"}`,
    path: `/customers/${customerId}/properties`,
    method: "POST",
    body: { id, ...draft },
    invalidates: ["tradie-customer", "tradie-property"],
  });
  return id;
}

export async function saveProperty(
  qc: QueryClient,
  customerId: string,
  propertyId: string,
  patch: PropertyDraft
): Promise<void> {
  patchRecord(qc, customerId, (prev) => ({
    ...prev,
    properties: prev.properties.map((p) => (p.id === propertyId ? { ...p, ...patch } : p)),
  }));
  await sendOrQueue({
    label: `Property · ${patch.nickname || "update"}`,
    path: `/properties/${propertyId}`,
    method: "PATCH",
    body: patch,
    invalidates: ["tradie-customer", "tradie-property"],
  });
}

export type AccessDraft = {
  accessMethod?: string | null;
  keySafe?: boolean;
  keySafeLocation?: string | null;
  accessCode?: string | null;
  alarm?: boolean;
  parking?: string | null;
  permitRequired?: boolean;
  workingHoursFrom?: string | null;
  workingHoursTo?: string | null;
  callBeforeArrival?: boolean;
  dogOnSite?: boolean;
  asbestosKnown?: boolean;
  safetyFlags?: string[];
  engineerNotes?: string | null;
};

export async function saveAccess(qc: QueryClient, propertyId: string, draft: AccessDraft): Promise<void> {
  await sendOrQueue({
    label: "Access & safety",
    path: `/properties/${propertyId}/access`,
    method: "PUT",
    body: draft,
    invalidates: ["tradie-customer", "tradie-property"],
  });
  void qc.invalidateQueries({ queryKey: ["tradie-property", propertyId] });
}

export type AssetDraft = {
  kind: string;
  name?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serial?: string | null;
  installDate?: string | null;
  location?: string | null;
  warrantyUntil?: string | null;
  lastServiceAt?: string | null;
  nextDueAt?: string | null;
  notes?: string | null;
};

export async function createAsset(
  qc: QueryClient,
  customerId: string,
  propertyId: string,
  draft: AssetDraft
): Promise<string> {
  const id = newOutboxId();
  const optimistic: AssetDto = {
    id,
    propertyId,
    kind: draft.kind,
    name: draft.name ?? null,
    manufacturer: draft.manufacturer ?? null,
    model: draft.model ?? null,
    serial: draft.serial ?? null,
    installDate: draft.installDate ?? null,
    location: draft.location ?? null,
    warrantyUntil: draft.warrantyUntil ?? null,
    lastServiceAt: draft.lastServiceAt ?? null,
    nextDueAt: draft.nextDueAt ?? null,
    notes: draft.notes ?? null,
    sort: 0,
  };
  patchRecord(qc, customerId, (prev) => ({
    ...prev,
    properties: prev.properties.map((p) =>
      p.id === propertyId ? { ...p, assets: [...p.assets, optimistic] } : p
    ),
  }));

  await sendOrQueue({
    label: `Asset · ${draft.name || draft.kind}`,
    path: `/properties/${propertyId}/assets`,
    method: "POST",
    body: { id, ...draft },
    invalidates: ["tradie-customer", "tradie-property"],
  });
  return id;
}

export async function saveAsset(
  qc: QueryClient,
  customerId: string,
  assetId: string,
  patch: Partial<AssetDraft>
): Promise<void> {
  patchRecord(qc, customerId, (prev) => ({
    ...prev,
    properties: prev.properties.map((p) => ({
      ...p,
      assets: p.assets.map((a) => (a.id === assetId ? ({ ...a, ...patch } as AssetDto) : a)),
    })),
  }));
  await sendOrQueue({
    label: `Asset · ${patch.name || "update"}`,
    path: `/assets/${assetId}`,
    method: "PATCH",
    body: patch,
    invalidates: ["tradie-customer", "tradie-property"],
  });
}

export async function deleteAsset(qc: QueryClient, customerId: string, assetId: string): Promise<void> {
  patchRecord(qc, customerId, (prev) => ({
    ...prev,
    properties: prev.properties.map((p) => ({ ...p, assets: p.assets.filter((a) => a.id !== assetId) })),
  }));
  await sendOrQueue({
    label: "Remove asset",
    path: `/assets/${assetId}`,
    method: "DELETE",
    body: {},
    invalidates: ["tradie-customer", "tradie-property"],
  });
}

export type NoteDraft = {
  body: string;
  type?: "CUSTOMER" | "PROPERTY" | "JOB" | "PRIVATE";
  pinned?: boolean;
  visibility?: "INTERNAL" | "CUSTOMER";
  propertyId?: string | null;
  assetId?: string | null;
};

export async function createNote(qc: QueryClient, customerId: string, draft: NoteDraft): Promise<string> {
  const id = newOutboxId();
  patchRecord(qc, customerId, (prev) => ({
    ...prev,
    customerNotes: [
      {
        id,
        type: draft.type ?? "CUSTOMER",
        body: draft.body,
        pinned: draft.pinned ?? false,
        visibility: draft.visibility ?? "INTERNAL",
        propertyId: draft.propertyId ?? null,
        assetId: draft.assetId ?? null,
        createdAt: new Date().toISOString(),
      },
      ...prev.customerNotes,
    ],
  }));

  await sendOrQueue({
    label: "Note",
    path: `/customers/${customerId}/notes`,
    method: "POST",
    body: { id, ...draft },
    invalidates: ["tradie-customer", "tradie-property"],
  });
  return id;
}

export async function deleteNote(qc: QueryClient, customerId: string, noteId: string): Promise<void> {
  patchRecord(qc, customerId, (prev) => ({
    ...prev,
    customerNotes: prev.customerNotes.filter((n) => n.id !== noteId),
  }));
  await sendOrQueue({
    label: "Remove note",
    path: `/notes/${noteId}`,
    method: "DELETE",
    body: {},
    invalidates: ["tradie-customer", "tradie-property"],
  });
}

export type ReminderDraft = {
  label: string;
  dueAt: string;
  kind?: string;
  everyMonths?: number | null;
  propertyId?: string | null;
  assetId?: string | null;
};

export async function createReminder(qc: QueryClient, customerId: string, draft: ReminderDraft): Promise<string> {
  const id = newOutboxId();
  patchRecord(qc, customerId, (prev) => ({
    ...prev,
    reminders: [
      ...prev.reminders,
      {
        id,
        kind: draft.kind ?? "OTHER",
        label: draft.label,
        dueAt: draft.dueAt,
        everyMonths: draft.everyMonths ?? null,
        active: true,
        propertyId: draft.propertyId ?? null,
        assetId: draft.assetId ?? null,
      },
    ].sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
  }));

  await sendOrQueue({
    label: `Reminder · ${draft.label}`,
    path: `/customers/${customerId}/reminders`,
    method: "POST",
    body: { id, ...draft },
    invalidates: ["tradie-customer", "tradie-property"],
  });
  return id;
}

export async function deleteReminder(qc: QueryClient, customerId: string, reminderId: string): Promise<void> {
  patchRecord(qc, customerId, (prev) => ({
    ...prev,
    reminders: prev.reminders.filter((r) => r.id !== reminderId),
  }));
  await sendOrQueue({
    label: "Remove reminder",
    path: `/reminders/${reminderId}`,
    method: "DELETE",
    body: {},
    invalidates: ["tradie-customer", "tradie-property"],
  });
}

/**
 * File uploads are the one write here that genuinely needs signal.
 *
 * The queue stores its items in IndexedDB, and a few megabytes of base64 per
 * certificate would fill it and take the rest of the queue down with it — losing
 * the quotes and job notes that matter more. So this one is honest about needing
 * a connection rather than pretending to save.
 */
export async function uploadCustomerFile(
  customerId: string,
  input: {
    filename: string;
    contentType: string;
    dataBase64: string;
    category?: string;
    propertyId?: string | null;
    assetId?: string | null;
    jobId?: string | null;
    issuedAt?: string | null;
    expiresAt?: string | null;
    visibility?: "INTERNAL" | "CUSTOMER";
  }
): Promise<void> {
  const { tRequest } = await import("../api/tradie");
  await tRequest(`/customers/${customerId}/files`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
