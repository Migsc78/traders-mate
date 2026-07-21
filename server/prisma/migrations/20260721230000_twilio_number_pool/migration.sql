-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TwilioPoolStatus" AS ENUM ('AVAILABLE', 'ASSIGNED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "TwilioNumberPool" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "sid" TEXT NOT NULL,
    "status" "TwilioPoolStatus" NOT NULL DEFAULT 'AVAILABLE',
    "assignedClientId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwilioNumberPool_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TwilioNumberPool_phoneNumber_key" ON "TwilioNumberPool"("phoneNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "TwilioNumberPool_sid_key" ON "TwilioNumberPool"("sid");
CREATE UNIQUE INDEX IF NOT EXISTS "TwilioNumberPool_assignedClientId_key" ON "TwilioNumberPool"("assignedClientId");
CREATE INDEX IF NOT EXISTS "TwilioNumberPool_status_idx" ON "TwilioNumberPool"("status");
