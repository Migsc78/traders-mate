-- CreateEnum
CREATE TYPE "EnquiryPipeline" AS ENUM ('INBOX', 'JOB', 'KILLED');

-- CreateEnum
CREATE TYPE "EnquiryTriage" AS ENUM ('LIKELY_JOB', 'QUOTE_SHOPPER', 'SPAM', 'UNKNOWN');

-- AlterTable
ALTER TABLE "Enquiry"
  ADD COLUMN "pipeline" "EnquiryPipeline" NOT NULL DEFAULT 'INBOX',
  ADD COLUMN "triage" "EnquiryTriage" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "promotedAt" TIMESTAMP(3),
  ADD COLUMN "killedAt" TIMESTAMP(3);

-- Backfill existing enquiries into Jobs so the Jobs list stays populated
UPDATE "Enquiry" SET "pipeline" = 'JOB';

-- CreateIndex
CREATE INDEX "Enquiry_clientId_pipeline_createdAt_idx" ON "Enquiry"("clientId", "pipeline", "createdAt");
