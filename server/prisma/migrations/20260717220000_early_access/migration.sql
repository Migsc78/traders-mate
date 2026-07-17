-- CreateEnum
CREATE TYPE "EarlyAccessStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateTable
CREATE TABLE "EarlyAccessRequest" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "occupation" TEXT NOT NULL,
    "status" "EarlyAccessStatus" NOT NULL DEFAULT 'PENDING',
    "inviteTokenHash" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "inviteSentAt" TIMESTAMP(3),
    "inviteUsedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EarlyAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EarlyAccessRequest_inviteTokenHash_key" ON "EarlyAccessRequest"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "EarlyAccessRequest_status_createdAt_idx" ON "EarlyAccessRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EarlyAccessRequest_email_idx" ON "EarlyAccessRequest"("email");

-- CreateIndex
CREATE INDEX "EarlyAccessRequest_phone_idx" ON "EarlyAccessRequest"("phone");
