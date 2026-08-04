-- Asset types become a per-account catalogue instead of a fixed enum.
--
-- UK trades don't share a vocabulary. A gas engineer services unvented cylinders
-- and flues, a sparky inspects consumer units and EV chargers, a roofer records a
-- covering with a warranty on it. No enum written up front survives the next
-- trade that signs up, so each account gets a researched starter list and adds
-- its own from there.

-- Convert kind to text IN PLACE. Prisma's own diff wanted to DROP and re-ADD the
-- column, which would have silently blanked the type off every asset already
-- recorded — the one thing a service register must never do.
ALTER TABLE "Asset" ALTER COLUMN "kind" DROP DEFAULT;

ALTER TABLE "Asset"
  ALTER COLUMN "kind" TYPE TEXT
  USING CASE "kind"::text
    WHEN 'BOILER'        THEN 'Combi boiler'
    WHEN 'CYLINDER'      THEN 'Unvented cylinder'
    WHEN 'THERMOSTAT'    THEN 'Thermostat / programmer'
    WHEN 'CONSUMER_UNIT' THEN 'Consumer unit / fuse board'
    WHEN 'HEAT_PUMP'     THEN 'Air source heat pump'
    WHEN 'MVHR'          THEN 'MVHR unit'
    ELSE 'Other'
  END;

ALTER TABLE "Asset" ALTER COLUMN "kind" SET DEFAULT 'Other';

-- DropEnum
DROP TYPE "AssetKind";

-- CreateTable
CREATE TABLE "AssetType" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'OTHER',
    "defaultServiceMonths" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetType_clientId_active_sort_idx" ON "AssetType"("clientId", "active", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "AssetType_clientId_label_key" ON "AssetType"("clientId", "label");

-- AddForeignKey
ALTER TABLE "AssetType" ADD CONSTRAINT "AssetType_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
