-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- CreateEnum
CREATE TYPE "ContactChannel" AS ENUM ('CALL', 'SMS', 'EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ContactRole" AS ENUM ('OWNER', 'TENANT', 'SITE_CONTACT', 'ACCOUNTS', 'PROPERTY_MANAGER');

-- CreateEnum
CREATE TYPE "Occupancy" AS ENUM ('OWNER_OCCUPIED', 'TENANTED', 'EMPTY');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('BOILER', 'CYLINDER', 'THERMOSTAT', 'CONSUMER_UNIT', 'HEAT_PUMP', 'MVHR', 'OTHER');

-- CreateEnum
CREATE TYPE "FileCategory" AS ENUM ('CERTIFICATE', 'MANUAL', 'WARRANTY', 'PHOTO', 'INVOICE', 'OTHER');

-- CreateEnum
CREATE TYPE "RecordVisibility" AS ENUM ('INTERNAL', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('CUSTOMER', 'PROPERTY', 'JOB', 'PRIVATE');

-- AlterTable
ALTER TABLE "Enquiry" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "propertyId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "customerId" TEXT;

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL',
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "phoneKey" TEXT,
    "email" TEXT,
    "preferredChannel" "ContactChannel" NOT NULL DEFAULT 'CALL',
    "billingAddress" TEXT,
    "billingPostcode" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "paymentTerms" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "ContactRole" NOT NULL DEFAULT 'OWNER',
    "phone" TEXT,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "receivesQuotes" BOOLEAN NOT NULL DEFAULT true,
    "receivesInvoices" BOOLEAN NOT NULL DEFAULT true,
    "receivesAppointments" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "nickname" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "town" TEXT,
    "postcode" TEXT,
    "propertyType" TEXT,
    "occupancy" "Occupancy",
    "siteContactId" TEXT,
    "billToCustomerId" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyAccess" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "accessMethod" TEXT,
    "keySafe" BOOLEAN NOT NULL DEFAULT false,
    "keySafeLocation" TEXT,
    "accessCode" TEXT,
    "alarm" BOOLEAN NOT NULL DEFAULT false,
    "parking" TEXT,
    "permitRequired" BOOLEAN NOT NULL DEFAULT false,
    "workingHoursFrom" TEXT,
    "workingHoursTo" TEXT,
    "callBeforeArrival" BOOLEAN NOT NULL DEFAULT false,
    "dogOnSite" BOOLEAN NOT NULL DEFAULT false,
    "asbestosKnown" BOOLEAN NOT NULL DEFAULT false,
    "safetyFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "engineerNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL DEFAULT 'BOILER',
    "name" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "serial" TEXT,
    "installDate" TIMESTAMP(3),
    "location" TEXT,
    "warrantyUntil" TIMESTAMP(3),
    "lastServiceAt" TIMESTAMP(3),
    "nextDueAt" TIMESTAMP(3),
    "notes" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerFile" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "customerId" TEXT,
    "propertyId" TEXT,
    "assetId" TEXT,
    "enquiryId" TEXT,
    "category" "FileCategory" NOT NULL DEFAULT 'OTHER',
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "visibility" "RecordVisibility" NOT NULL DEFAULT 'INTERNAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerNote" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "customerId" TEXT,
    "propertyId" TEXT,
    "assetId" TEXT,
    "enquiryId" TEXT,
    "type" "NoteType" NOT NULL DEFAULT 'CUSTOMER',
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "RecordVisibility" NOT NULL DEFAULT 'INTERNAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "customerId" TEXT,
    "propertyId" TEXT,
    "assetId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "label" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "everyMonths" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastFiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_clientId_name_idx" ON "Customer"("clientId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_clientId_phoneKey_key" ON "Customer"("clientId", "phoneKey");

-- CreateIndex
CREATE INDEX "Contact_customerId_sort_idx" ON "Contact"("customerId", "sort");

-- CreateIndex
CREATE INDEX "Property_customerId_sort_idx" ON "Property"("customerId", "sort");

-- CreateIndex
CREATE INDEX "Property_clientId_postcode_idx" ON "Property"("clientId", "postcode");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyAccess_propertyId_key" ON "PropertyAccess"("propertyId");

-- CreateIndex
CREATE INDEX "Asset_propertyId_sort_idx" ON "Asset"("propertyId", "sort");

-- CreateIndex
CREATE INDEX "Asset_clientId_nextDueAt_idx" ON "Asset"("clientId", "nextDueAt");

-- CreateIndex
CREATE INDEX "CustomerFile_clientId_customerId_createdAt_idx" ON "CustomerFile"("clientId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerFile_clientId_expiresAt_idx" ON "CustomerFile"("clientId", "expiresAt");

-- CreateIndex
CREATE INDEX "CustomerNote_clientId_customerId_createdAt_idx" ON "CustomerNote"("clientId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Reminder_clientId_active_dueAt_idx" ON "Reminder"("clientId", "active", "dueAt");

-- CreateIndex
CREATE INDEX "Enquiry_clientId_customerId_idx" ON "Enquiry"("clientId", "customerId");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_siteContactId_fkey" FOREIGN KEY ("siteContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_billToCustomerId_fkey" FOREIGN KEY ("billToCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyAccess" ADD CONSTRAINT "PropertyAccess_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFile" ADD CONSTRAINT "CustomerFile_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFile" ADD CONSTRAINT "CustomerFile_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFile" ADD CONSTRAINT "CustomerFile_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFile" ADD CONSTRAINT "CustomerFile_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

