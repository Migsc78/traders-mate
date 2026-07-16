-- AlterEnum ClientStatus
ALTER TYPE "ClientStatus" ADD VALUE IF NOT EXISTS 'TRIAL';

-- CreateEnum
DO $$ BEGIN
 CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'OVERDUE', 'VOID');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL', 'SYSTEM');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "MissedCallStatus" AS ENUM ('PENDING', 'QUALIFYING', 'CONVERTED', 'SPAM', 'EXPIRED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- AlterEnum FollowUpKind
ALTER TYPE "FollowUpKind" ADD VALUE IF NOT EXISTS 'INVOICE_D3';
ALTER TYPE "FollowUpKind" ADD VALUE IF NOT EXISTS 'INVOICE_D7';

-- AlterTable Client
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "phoneVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "twilioNumber" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "inboundEmailLocal" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "bankName" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "bankSortCode" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "bankAccountName" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "bankAccountNumber" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Client_inboundEmailLocal_key" ON "Client"("inboundEmailLocal");
CREATE INDEX IF NOT EXISTS "Client_destPhone_idx" ON "Client"("destPhone");
CREATE INDEX IF NOT EXISTS "Client_twilioNumber_idx" ON "Client"("twilioNumber");

CREATE INDEX IF NOT EXISTS "Enquiry_clientId_phone_idx" ON "Enquiry"("clientId", "phone");

-- AlterTable FollowUp
ALTER TABLE "FollowUp" ALTER COLUMN "quoteId" DROP NOT NULL;
ALTER TABLE "FollowUp" ADD COLUMN IF NOT EXISTS "invoiceId" TEXT;

-- CreateTable Invoice
CREATE TABLE IF NOT EXISTS "Invoice" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "enquiryId" TEXT,
    "quoteId" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "publicToken" TEXT NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "vatInclusive" BOOLEAN NOT NULL DEFAULT true,
    "subtotalPence" INTEGER NOT NULL DEFAULT 0,
    "vatPence" INTEGER NOT NULL DEFAULT 0,
    "totalPence" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "reference" TEXT,
    "bankName" TEXT,
    "bankSortCode" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "customerNote" TEXT,
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paidReportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_publicToken_key" ON "Invoice"("publicToken");
CREATE INDEX IF NOT EXISTS "Invoice_clientId_status_createdAt_idx" ON "Invoice"("clientId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Invoice_enquiryId_idx" ON "Invoice"("enquiryId");
CREATE INDEX IF NOT EXISTS "Invoice_quoteId_idx" ON "Invoice"("quoteId");

CREATE TABLE IF NOT EXISTS "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'JOB',
    "unitPricePence" INTEGER NOT NULL,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

CREATE TABLE IF NOT EXISTS "Message" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "enquiryId" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'SMS',
    "toAddr" TEXT NOT NULL,
    "fromAddr" TEXT,
    "body" TEXT NOT NULL,
    "twilioSid" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Message_clientId_createdAt_idx" ON "Message"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_enquiryId_createdAt_idx" ON "Message"("enquiryId", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_toAddr_idx" ON "Message"("toAddr");

CREATE TABLE IF NOT EXISTS "MissedCall" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "callerPhone" TEXT NOT NULL,
    "status" "MissedCallStatus" NOT NULL DEFAULT 'PENDING',
    "enquiryId" TEXT,
    "conversation" JSONB,
    "callSid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissedCall_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MissedCall_clientId_callerPhone_status_idx" ON "MissedCall"("clientId", "callerPhone", "status");
CREATE INDEX IF NOT EXISTS "MissedCall_callerPhone_status_idx" ON "MissedCall"("callerPhone", "status");

CREATE TABLE IF NOT EXISTS "OtpChallenge" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "payload" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OtpChallenge_phone_purpose_idx" ON "OtpChallenge"("phone", "purpose");
CREATE INDEX IF NOT EXISTS "OtpChallenge_expiresAt_idx" ON "OtpChallenge"("expiresAt");

CREATE INDEX IF NOT EXISTS "FollowUp_invoiceId_idx" ON "FollowUp"("invoiceId");

-- FKs (idempotent-ish)
DO $$ BEGIN
 ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "Message" ADD CONSTRAINT "Message_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "Message" ADD CONSTRAINT "Message_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "MissedCall" ADD CONSTRAINT "MissedCall_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "MissedCall" ADD CONSTRAINT "MissedCall_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
