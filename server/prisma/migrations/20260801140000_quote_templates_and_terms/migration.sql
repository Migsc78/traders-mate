-- AlterTable
ALTER TABLE "Enquiry" ADD COLUMN     "email" TEXT;

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "reference" TEXT,
ADD COLUMN     "validDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "earliestStartAt" TIMESTAMP(3),
ADD COLUMN     "estimatedDuration" TEXT,
ADD COLUMN     "termsNote" TEXT;

-- CreateTable
CREATE TABLE "QuoteTemplate" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'JOB',
    "unitPricePence" INTEGER NOT NULL DEFAULT 0,
    "vatRate" INTEGER NOT NULL DEFAULT 20,
    "isAddOn" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "priceBookItemId" TEXT,

    CONSTRAINT "QuoteTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteTemplate_clientId_active_name_idx" ON "QuoteTemplate"("clientId", "active", "name");

-- CreateIndex
CREATE INDEX "QuoteTemplate_clientId_lastUsedAt_idx" ON "QuoteTemplate"("clientId", "lastUsedAt");

-- CreateIndex
CREATE INDEX "QuoteTemplateItem_templateId_isAddOn_sortOrder_idx" ON "QuoteTemplateItem"("templateId", "isAddOn", "sortOrder");

-- AddForeignKey
ALTER TABLE "QuoteTemplate" ADD CONSTRAINT "QuoteTemplate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteTemplateItem" ADD CONSTRAINT "QuoteTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "QuoteTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
