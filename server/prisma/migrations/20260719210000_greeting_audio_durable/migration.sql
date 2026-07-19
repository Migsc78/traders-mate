-- AlterTable
ALTER TABLE "Client" ADD COLUMN "greetingPlayToken" TEXT;
ALTER TABLE "Client" ADD COLUMN "greetingAudioData" BYTEA;
ALTER TABLE "Client" ADD COLUMN "greetingAudioMime" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Client_greetingPlayToken_key" ON "Client"("greetingPlayToken");
