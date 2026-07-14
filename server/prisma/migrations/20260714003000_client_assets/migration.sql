-- CreateEnum
CREATE TYPE "ClientAssetKind" AS ENUM ('LOGO', 'SHOWCASE', 'JOB', 'OTHER');

-- CreateTable
CREATE TABLE "ClientAsset" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "ClientAssetKind" NOT NULL DEFAULT 'SHOWCASE',
    "url" TEXT NOT NULL,
    "filename" TEXT,
    "caption" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientAsset_clientId_kind_idx" ON "ClientAsset"("clientId", "kind");

-- AddForeignKey
ALTER TABLE "ClientAsset" ADD CONSTRAINT "ClientAsset_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
