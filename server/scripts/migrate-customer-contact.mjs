/**
 * Apply CustomerContact table (idempotent).
 * Usage: node --env-file=.env scripts/migrate-customer-contact.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "CustomerContact" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "phoneKey" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "name" TEXT,
  "notes" TEXT,
  "plantNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);
`);

await prisma.$executeRawUnsafe(`
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerContact_clientId_phoneKey_key"
ON "CustomerContact"("clientId", "phoneKey");
`);

await prisma.$executeRawUnsafe(`
CREATE INDEX IF NOT EXISTS "CustomerContact_clientId_updatedAt_idx"
ON "CustomerContact"("clientId", "updatedAt");
`);

await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  ALTER TABLE "CustomerContact"
    ADD CONSTRAINT "CustomerContact_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`);

console.log("CustomerContact ready");
await prisma.$disconnect();
