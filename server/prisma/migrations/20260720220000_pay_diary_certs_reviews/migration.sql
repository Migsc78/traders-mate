-- AlterEnum FollowUpKind (PG 15+ IF NOT EXISTS; fallback DO blocks)
DO $$ BEGIN ALTER TYPE "FollowUpKind" ADD VALUE IF NOT EXISTS 'REVIEW_ASK'; EXCEPTION WHEN others THEN null; END $$;
DO $$ BEGIN ALTER TYPE "FollowUpKind" ADD VALUE IF NOT EXISTS 'REVIEW_NUDGE'; EXCEPTION WHEN others THEN null; END $$;
DO $$ BEGIN ALTER TYPE "FollowUpKind" ADD VALUE IF NOT EXISTS 'APPT_CONFIRM'; EXCEPTION WHEN others THEN null; END $$;
DO $$ BEGIN ALTER TYPE "FollowUpKind" ADD VALUE IF NOT EXISTS 'APPT_REMINDER'; EXCEPTION WHEN others THEN null; END $$;
DO $$ BEGIN ALTER TYPE "FollowUpKind" ADD VALUE IF NOT EXISTS 'SERVICE_REMINDER'; EXCEPTION WHEN others THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'ON_THE_WAY', 'DONE', 'CANCELLED', 'NO_SHOW');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "CertificateKind" AS ENUM ('GAS_SAFETY', 'MINOR_WORKS', 'EICR');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "CertificateStatus" AS ENUM ('DRAFT', 'SIGNED', 'SENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Client columns
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "stripeConnectAccountId" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "stripeConnectOnboarded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "googleReviewUrl" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "defaultDepositPercent" INTEGER NOT NULL DEFAULT 0;

-- Quote deposit columns
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "depositPercent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "depositPence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "depositPaidAt" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "depositStripeSessionId" TEXT;

-- Invoice payment columns
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "amountDuePence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "depositAppliedPence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "pdfUrl" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "stripeCheckoutSessionId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "stripePaymentIntentId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paidVia" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "reviewAskedAt" TIMESTAMP(3);

-- Backfill amountDuePence from totalPence where still 0
UPDATE "Invoice" SET "amountDuePence" = "totalPence" WHERE "amountDuePence" = 0 AND "totalPence" > 0;

-- FollowUp optional links
ALTER TABLE "FollowUp" ADD COLUMN IF NOT EXISTS "appointmentId" TEXT;
ALTER TABLE "FollowUp" ADD COLUMN IF NOT EXISTS "certificateId" TEXT;
ALTER TABLE "FollowUp" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
ALTER TABLE "FollowUp" ADD COLUMN IF NOT EXISTS "enquiryId" TEXT;

-- Appointment
CREATE TABLE IF NOT EXISTS "Appointment" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "enquiryId" TEXT,
  "title" TEXT NOT NULL,
  "notes" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
  "address" TEXT,
  "customerName" TEXT,
  "customerPhone" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Appointment_clientId_startsAt_idx" ON "Appointment"("clientId", "startsAt");
CREATE INDEX IF NOT EXISTS "Appointment_enquiryId_idx" ON "Appointment"("enquiryId");

-- Certificate
CREATE TABLE IF NOT EXISTS "Certificate" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "enquiryId" TEXT,
  "kind" "CertificateKind" NOT NULL,
  "status" "CertificateStatus" NOT NULL DEFAULT 'DRAFT',
  "siteAddress" TEXT,
  "customerName" TEXT,
  "customerPhone" TEXT,
  "customerEmail" TEXT,
  "formData" JSONB NOT NULL DEFAULT '{}',
  "signatureDataUrl" TEXT,
  "signedAt" TIMESTAMP(3),
  "pdfUrl" TEXT,
  "publicToken" TEXT NOT NULL,
  "serviceDueAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Certificate_publicToken_key" ON "Certificate"("publicToken");
CREATE INDEX IF NOT EXISTS "Certificate_clientId_kind_createdAt_idx" ON "Certificate"("clientId", "kind", "createdAt");
CREATE INDEX IF NOT EXISTS "Certificate_enquiryId_idx" ON "Certificate"("enquiryId");
CREATE INDEX IF NOT EXISTS "Certificate_serviceDueAt_idx" ON "Certificate"("serviceDueAt");

-- FKs (ignore if already exist)
DO $$ BEGIN
  ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "FollowUp_appointmentId_idx" ON "FollowUp"("appointmentId");
CREATE INDEX IF NOT EXISTS "FollowUp_certificateId_idx" ON "FollowUp"("certificateId");
