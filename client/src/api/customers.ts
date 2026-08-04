/**
 * Customer record API — types and reads.
 *
 * Writes live in lib/newCustomer.ts because they all go through sendOrQueue: a
 * tradie stands in someone's hallway with no signal adding the boiler they're
 * looking at, and none of this is worth having if that has to wait for a bar.
 */
import { tRequest } from "./tradie";

export type ContactRole = "OWNER" | "TENANT" | "SITE_CONTACT" | "ACCOUNTS" | "PROPERTY_MANAGER";
export type Occupancy = "OWNER_OCCUPIED" | "TENANTED" | "EMPTY";
export type FileCategory = "CERTIFICATE" | "MANUAL" | "WARRANTY" | "PHOTO" | "INVOICE" | "OTHER";
export type NoteType = "CUSTOMER" | "PROPERTY" | "JOB" | "PRIVATE";
export type Visibility = "INTERNAL" | "CUSTOMER";
export type ContactChannel = "CALL" | "SMS" | "EMAIL" | "WHATSAPP";

export const CONTACT_ROLES: { id: ContactRole; label: string }[] = [
  { id: "OWNER", label: "Owner" },
  { id: "TENANT", label: "Tenant" },
  { id: "SITE_CONTACT", label: "Site contact" },
  { id: "ACCOUNTS", label: "Accounts" },
  { id: "PROPERTY_MANAGER", label: "Property manager" },
];

export const OCCUPANCIES: { id: Occupancy; label: string }[] = [
  { id: "OWNER_OCCUPIED", label: "Owner occupied" },
  { id: "TENANTED", label: "Tenanted" },
  { id: "EMPTY", label: "Empty" },
];

export const FILE_CATEGORIES: { id: FileCategory; label: string }[] = [
  { id: "CERTIFICATE", label: "Certificates" },
  { id: "PHOTO", label: "Photos" },
  { id: "MANUAL", label: "Manuals" },
  { id: "WARRANTY", label: "Warranties" },
  { id: "INVOICE", label: "Invoices" },
  { id: "OTHER", label: "Other documents" },
];

export const NOTE_TYPES: { id: NoteType; label: string }[] = [
  { id: "CUSTOMER", label: "Customer" },
  { id: "PROPERTY", label: "Property" },
  { id: "JOB", label: "Job" },
  { id: "PRIVATE", label: "Private (office)" },
];

export function roleLabel(role: string): string {
  return CONTACT_ROLES.find((r) => r.id === role)?.label ?? role;
}

export function occupancyLabel(o: string | null | undefined): string {
  if (!o) return "—";
  return OCCUPANCIES.find((x) => x.id === o)?.label ?? o;
}

export interface ContactDto {
  id: string;
  name: string;
  role: ContactRole;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  receivesQuotes: boolean;
  receivesInvoices: boolean;
  receivesAppointments: boolean;
  notes: string | null;
  sort: number;
}

export interface AssetDto {
  id: string;
  propertyId: string;
  kind: string;
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  installDate: string | null;
  location: string | null;
  warrantyUntil: string | null;
  lastServiceAt: string | null;
  nextDueAt: string | null;
  notes: string | null;
  sort: number;
}

/** Note there is no accessCode — the server strips it. See PropertyAccessCode. */
export interface AccessDto {
  id: string;
  accessMethod: string | null;
  keySafe: boolean;
  keySafeLocation: string | null;
  alarm: boolean;
  parking: string | null;
  permitRequired: boolean;
  workingHoursFrom: string | null;
  workingHoursTo: string | null;
  callBeforeArrival: boolean;
  dogOnSite: boolean;
  asbestosKnown: boolean;
  safetyFlags: string[];
  engineerNotes: string | null;
  hasAccessCode: boolean;
}

export interface PropertyDto {
  id: string;
  customerId: string;
  nickname: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  town: string | null;
  postcode: string | null;
  propertyType: string | null;
  occupancy: Occupancy | null;
  siteContactId: string | null;
  billToCustomerId: string | null;
  sort: number;
  access: AccessDto | null;
  assets: AssetDto[];
  openJobCount: number;
}

export interface CustomerFileDto {
  id: string;
  category: FileCategory;
  filename: string;
  url: string;
  contentType: string | null;
  sizeBytes: number | null;
  issuedAt: string | null;
  expiresAt: string | null;
  visibility: Visibility;
  propertyId: string | null;
  assetId: string | null;
  createdAt: string;
}

export interface CustomerNoteDto {
  id: string;
  type: NoteType;
  body: string;
  pinned: boolean;
  visibility: Visibility;
  propertyId: string | null;
  assetId: string | null;
  createdAt: string;
}

export interface ReminderDto {
  id: string;
  kind: string;
  label: string;
  dueAt: string;
  everyMonths: number | null;
  active: boolean;
  propertyId: string | null;
  assetId: string | null;
}

export interface CustomerListRow {
  id: string;
  name: string;
  type: "INDIVIDUAL" | "COMPANY";
  phone: string | null;
  phoneKey: string | null;
  email: string | null;
  tags: string[];
  postcode: string | null;
  town: string | null;
  propertyCount: number;
  jobCount: number;
  primaryContact: ContactDto | null;
  outstandingPence: number;
  outstandingCount: number;
}

export interface CustomerRecord {
  id: string;
  type: "INDIVIDUAL" | "COMPANY";
  name: string;
  phone: string | null;
  phoneKey: string | null;
  email: string | null;
  preferredChannel: ContactChannel;
  billingAddress: string | null;
  billingPostcode: string | null;
  tags: string[];
  paymentTerms: string | null;
  notes: string | null;
  contacts: ContactDto[];
  properties: PropertyDto[];
  customerNotes: CustomerNoteDto[];
  files: CustomerFileDto[];
  reminders: ReminderDto[];
  summary: {
    outstandingPence: number;
    outstandingCount: number;
    overdueCount: number;
    paidPence: number;
    openJobs: number;
    openJobValuePence: number;
    draftQuotes: number;
    draftQuoteValuePence: number;
    nextAppointment: { id: string; title: string; startsAt: string; endsAt: string } | null;
  };
}

export interface ActivityDto {
  id: string;
  at: string;
  kind: string;
  title: string;
  detail: string | null;
  tone: "info" | "good" | "alert";
  href: string | null;
}

export interface CustomerJobDto {
  id: string;
  title: string;
  createdAt: string;
  pipeline: string;
  property: { id: string; nickname: string | null; postcode: string | null } | null;
  latestQuote: { id: string; status: string; totalPence: number } | null;
}

export interface CustomerBillingDto {
  invoices: {
    id: string;
    reference: string | null;
    status: string;
    totalPence: number;
    amountDuePence: number;
    dueDate: string | null;
    sentAt: string | null;
    paidAt: string | null;
    createdAt: string;
    enquiryId: string | null;
    publicToken: string;
    overdue: boolean;
  }[];
  totals: {
    outstandingPence: number;
    outstandingCount: number;
    overdueCount: number;
    paidPence: number;
  };
}

export interface AssetTypeDto {
  id: string;
  label: string;
  group: string;
  defaultServiceMonths: number | null;
  active: boolean;
  sort: number;
}

export interface PropertyDetail extends PropertyDto {
  siteContact: ContactDto | null;
  customer: { id: string; name: string; phone: string | null };
  files: CustomerFileDto[];
  propertyNotes: CustomerNoteDto[];
  reminders: ReminderDto[];
}

export const customersApi = {
  list: () => tRequest<CustomerListRow[]>("/customers"),
  get: (id: string) => tRequest<CustomerRecord>(`/customers/${encodeURIComponent(id)}`),
  activity: (id: string) => tRequest<ActivityDto[]>(`/customers/${encodeURIComponent(id)}/activity`),
  jobs: (id: string) => tRequest<CustomerJobDto[]>(`/customers/${encodeURIComponent(id)}/jobs`),
  billing: (id: string) => tRequest<CustomerBillingDto>(`/customers/${encodeURIComponent(id)}/billing`),
  property: (id: string) => tRequest<PropertyDetail>(`/properties/${encodeURIComponent(id)}`),
  assetTypes: () => tRequest<AssetTypeDto[]>("/asset-types"),

  /**
   * Fetch the access code, on purpose and on its own.
   *
   * Never cached and never batched into the record: the whole point of masking is
   * that the code isn't sitting in a payload the moment anyone opens the record.
   */
  revealAccessCode: (propertyId: string) =>
    tRequest<{ accessCode: string | null }>(`/properties/${encodeURIComponent(propertyId)}/access/reveal`, {
      method: "POST",
      body: "{}",
    }),
};
