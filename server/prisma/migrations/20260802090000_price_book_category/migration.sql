-- AlterTable
ALTER TABLE "PriceBookItem" ADD COLUMN     "category" TEXT;

-- Bin existing rates once, so nobody opens Rates to find their whole price book
-- sitting under "Other". A one-off guess the tradie can correct beats inferring
-- the same guess on every render and never letting them change it.
UPDATE "PriceBookItem"
SET "category" = CASE
  WHEN "isCallout" THEN 'CALLOUT'
  WHEN "unit" IN ('HOUR', 'DAY') THEN 'LABOUR'
  ELSE 'SERVICE'
END
WHERE "category" IS NULL;
