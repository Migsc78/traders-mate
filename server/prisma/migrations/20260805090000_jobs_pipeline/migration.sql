-- CreateEnum
CREATE TYPE "JobOperational" AS ENUM ('UNSCHEDULED', 'SCHEDULED', 'ON_THE_WAY', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobCommercial" AS ENUM ('UNQUOTED', 'QUOTED', 'DEPOSIT_DUE', 'DEPOSIT_PAID', 'READY_TO_INVOICE', 'INVOICE_SENT', 'PAID');

-- CreateEnum
CREATE TYPE "JobCostType" AS ENUM ('MATERIAL', 'LABOUR', 'EXPENSE', 'SUBCONTRACTOR');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "arrivalWindowEnd" TIMESTAMP(3),
ADD COLUMN     "arrivalWindowStart" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "kind" TEXT;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "labourCostPerHourPence" INTEGER;

-- AlterTable
ALTER TABLE "CustomerFile" ADD COLUMN     "jobId" TEXT;

-- AlterTable
ALTER TABLE "CustomerNote" ADD COLUMN     "jobId" TEXT;

-- AlterTable
ALTER TABLE "PriceBookItem" ADD COLUMN     "costPricePence" INTEGER;

-- AlterTable
ALTER TABLE "QuoteLine" ADD COLUMN     "costPricePence" INTEGER;

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "enquiryId" TEXT,
    "quoteId" TEXT,
    "customerId" TEXT,
    "propertyId" TEXT,
    "siteContactId" TEXT,
    "reference" TEXT,
    "title" TEXT NOT NULL,
    "scope" TEXT,
    "operational" "JobOperational" NOT NULL DEFAULT 'UNSCHEDULED',
    "commercial" "JobCommercial" NOT NULL DEFAULT 'UNQUOTED',
    "quotedTotalPence" INTEGER NOT NULL DEFAULT 0,
    "depositPaidPence" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCost" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" "JobCostType" NOT NULL DEFAULT 'MATERIAL',
    "label" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" "PriceUnit" NOT NULL DEFAULT 'JOB',
    "unitCostPence" INTEGER NOT NULL DEFAULT 0,
    "sellPricePence" INTEGER NOT NULL DEFAULT 0,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "priceBookItemId" TEXT,
    "isExtra" BOOLEAN NOT NULL DEFAULT false,
    "agreedAt" TIMESTAMP(3),
    "agreedVia" TEXT,
    "receiptFileId" TEXT,
    "invoicedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobEvent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessReveal" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "jobId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessReveal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_clientId_operational_createdAt_idx" ON "Job"("clientId", "operational", "createdAt");

-- CreateIndex
CREATE INDEX "Job_clientId_commercial_createdAt_idx" ON "Job"("clientId", "commercial", "createdAt");

-- CreateIndex
CREATE INDEX "Job_clientId_archivedAt_idx" ON "Job"("clientId", "archivedAt");

-- CreateIndex
CREATE INDEX "Job_customerId_idx" ON "Job"("customerId");

-- CreateIndex
CREATE INDEX "Job_propertyId_idx" ON "Job"("propertyId");

-- CreateIndex
CREATE INDEX "Job_quoteId_idx" ON "Job"("quoteId");

-- CreateIndex
CREATE INDEX "Job_enquiryId_idx" ON "Job"("enquiryId");

-- CreateIndex
CREATE INDEX "JobCost_jobId_sort_idx" ON "JobCost"("jobId", "sort");

-- CreateIndex
CREATE INDEX "JobCost_clientId_invoicedAt_idx" ON "JobCost"("clientId", "invoicedAt");

-- CreateIndex
CREATE INDEX "JobEvent_jobId_createdAt_idx" ON "JobEvent"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "AccessReveal_clientId_createdAt_idx" ON "AccessReveal"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "AccessReveal_propertyId_createdAt_idx" ON "AccessReveal"("propertyId", "createdAt");

-- CreateIndex
CREATE INDEX "Appointment_jobId_startsAt_idx" ON "Appointment"("jobId", "startsAt");

-- CreateIndex
CREATE INDEX "CustomerFile_clientId_jobId_createdAt_idx" ON "CustomerFile"("clientId", "jobId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerFile" ADD CONSTRAINT "CustomerFile_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_siteContactId_fkey" FOREIGN KEY ("siteContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCost" ADD CONSTRAINT "JobCost_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCost" ADD CONSTRAINT "JobCost_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCost" ADD CONSTRAINT "JobCost_priceBookItemId_fkey" FOREIGN KEY ("priceBookItemId") REFERENCES "PriceBookItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCost" ADD CONSTRAINT "JobCost_receiptFileId_fkey" FOREIGN KEY ("receiptFileId") REFERENCES "CustomerFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobEvent" ADD CONSTRAINT "JobEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobEvent" ADD CONSTRAINT "JobEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessReveal" ADD CONSTRAINT "AccessReveal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessReveal" ADD CONSTRAINT "AccessReveal_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessReveal" ADD CONSTRAINT "AccessReveal_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ===========================================================================
-- Backfill: give every existing "job" a real Job record.
--
-- Until now a job was an Enquiry row with pipeline flipped to JOB, and its
-- status was whatever its newest quote happened to say. Each of those rows now
-- gets a Job of its own with its own two states.
--
-- The new Job reuses the enquiry's cuid as its primary key. Different tables,
-- no collision, and it is what keeps /t/jobs/<id> resolving — including links
-- already on the owner's phone and any offline writes still sat in the outbox
-- queued against /jobs/<id>/archive. Twelve route handlers change what they do
-- without changing their URL.
--
-- KILLED enquiries (dead leads and spam) are deliberately excluded: they never
-- became work. ARCHIVED ones did, so they come across archived.
-- ===========================================================================

INSERT INTO "Job" (
  "id", "clientId", "enquiryId", "quoteId", "customerId", "propertyId",
  "title", "scope", "operational", "commercial",
  "quotedTotalPence", "depositPaidPence", "completedAt", "archivedAt",
  "createdAt", "updatedAt"
)
SELECT
  e."id",
  e."clientId",
  e."id",
  q."id",
  e."customerId",
  e."propertyId",
  -- Title, best effort, in the order a human would pick it.
  COALESCE(
    NULLIF(TRIM(e."summary"), ''),
    NULLIF(TRIM(LEFT(COALESCE(e."message", ''), 80)), ''),
    'Job for ' || e."name"
  ),
  e."message",
  CASE
    WHEN inv."id" IS NOT NULL THEN 'COMPLETED'::"JobOperational"
    ELSE 'UNSCHEDULED'::"JobOperational"
  END,
  CASE
    WHEN inv."paidAt" IS NOT NULL           THEN 'PAID'::"JobCommercial"
    WHEN inv."id" IS NOT NULL               THEN 'INVOICE_SENT'::"JobCommercial"
    WHEN q."depositPaidAt" IS NOT NULL      THEN 'DEPOSIT_PAID'::"JobCommercial"
    WHEN q."id" IS NOT NULL                 THEN 'QUOTED'::"JobCommercial"
    ELSE 'UNQUOTED'::"JobCommercial"
  END,
  -- Ex-VAT. VAT is not the tradie's money and must never reach a profit figure.
  COALESCE(q."subtotalPence", 0),
  CASE WHEN q."depositPaidAt" IS NOT NULL THEN COALESCE(q."depositPence", 0) ELSE 0 END,
  -- An invoice exists, so the work was done; we have no better timestamp than
  -- the invoice's own.
  inv."createdAt",
  CASE WHEN e."pipeline" = 'ARCHIVED' THEN NOW() ELSE NULL END,
  e."createdAt",
  NOW()
FROM "Enquiry" e
-- Prefer the accepted quote over the newest one: an accepted quote is the
-- commercial baseline even if a later draft was started and abandoned.
LEFT JOIN LATERAL (
  SELECT qq.*
  FROM "Quote" qq
  WHERE qq."enquiryId" = e."id"
    AND qq."status" NOT IN ('DELETED', 'ARCHIVED')
  ORDER BY (qq."status" = 'ACCEPTED') DESC, qq."createdAt" DESC
  LIMIT 1
) q ON TRUE
LEFT JOIN LATERAL (
  SELECT ii.*
  FROM "Invoice" ii
  WHERE ii."enquiryId" = e."id"
    AND ii."status" <> 'VOID'
  ORDER BY (ii."paidAt" IS NOT NULL) DESC, ii."createdAt" DESC
  LIMIT 1
) inv ON TRUE
WHERE e."pipeline" IN ('JOB', 'ARCHIVED');

-- Existing appointments become the job's visits. Nothing moves; the diary is
-- already correct, it just knows which job it belongs to now.
UPDATE "Appointment" a
SET "jobId" = a."enquiryId"
FROM "Job" j
WHERE j."id" = a."enquiryId"
  AND a."jobId" IS NULL;

-- Files and notes filed against the enquiry are job files and job notes.
UPDATE "CustomerFile" f
SET "jobId" = f."enquiryId"
FROM "Job" j
WHERE j."id" = f."enquiryId"
  AND f."jobId" IS NULL;

UPDATE "CustomerNote" n
SET "jobId" = n."enquiryId"
FROM "Job" j
WHERE j."id" = n."enquiryId"
  AND n."jobId" IS NULL;

-- One creation event per migrated job so the Activity tab isn't blank on rows
-- that predate the event log.
INSERT INTO "JobEvent" ("id", "clientId", "jobId", "type", "summary", "createdAt")
SELECT
  'evt_mig_' || j."id",
  j."clientId",
  j."id",
  'job.created',
  'Job created',
  j."createdAt"
FROM "Job" j;
