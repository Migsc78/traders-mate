-- CreateEnum
CREATE TYPE "MissedCallMode" AS ENUM ('SMS_QUALIFY', 'VOICEMAIL');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "missedCallMode" "MissedCallMode" NOT NULL DEFAULT 'SMS_QUALIFY';
