-- "Cost not set" and "cost is genuinely zero" are different answers.
--
-- Zero is real: own labour, or a part the customer supplied. Not-set is a gap.
-- With a NOT NULL default of 0 an unpriced material reads as pure profit, which
-- is the single wrong number this feature must never show. JobCost is empty at
-- this point, so this drops cleanly.
ALTER TABLE "JobCost" ALTER COLUMN "unitCostPence" DROP NOT NULL;
ALTER TABLE "JobCost" ALTER COLUMN "unitCostPence" DROP DEFAULT;
