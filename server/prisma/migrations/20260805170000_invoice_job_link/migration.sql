-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "jobId" TEXT;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CreateIndex
CREATE INDEX "Invoice_jobId_idx" ON "Invoice"("jobId");

-- Existing invoices predate jobs, but every one of them came from an enquiry
-- that now has a job with the same id. Linking them means historic work shows
-- as billed rather than sitting in "To invoice" as if nobody had ever charged
-- for it.
UPDATE "Invoice" i
SET "jobId" = j."id"
FROM "Job" j
WHERE j."id" = i."enquiryId"
  AND i."jobId" IS NULL;
