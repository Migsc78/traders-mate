-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "editorialSummary" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "googleReviews" JSONB,
ADD COLUMN     "openingHours" TEXT,
ADD COLUMN     "primaryType" TEXT;
