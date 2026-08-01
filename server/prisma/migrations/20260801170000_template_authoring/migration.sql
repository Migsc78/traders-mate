-- AlterTable
ALTER TABLE "QuoteTemplate" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "defaultDurationMins" INTEGER,
ADD COLUMN     "useForAiDrafting" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "vatRate" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "depositPercent" INTEGER,
ADD COLUMN     "notes" TEXT;
