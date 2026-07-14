-- CreateEnum
CREATE TYPE "WebsiteClass" AS ENUM ('NONE', 'SOCIAL_ONLY', 'DIRECTORY_ONLY', 'PROPER', 'PROPER_DEAD');

-- CreateEnum
CREATE TYPE "WebsiteCheck" AS ENUM ('OK', 'DEAD', 'SKIPPED', 'AMBIGUOUS');

-- CreateEnum
CREATE TYPE "BizStatus" AS ENUM ('OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('NEW', 'SCREENED', 'CONTACTED', 'INTERESTED', 'DEMO_SENT', 'SOLD', 'DEAD', 'DO_NOT_CONTACT');

-- CreateEnum
CREATE TYPE "DomainState" AS ENUM ('AVAILABLE', 'TAKEN', 'UNKNOWN');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "occupation" TEXT NOT NULL,
    "town" TEXT NOT NULL,
    "formattedAddress" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "phone" TEXT,
    "phoneIsMobile" BOOLEAN NOT NULL DEFAULT false,
    "googleMapsUri" TEXT,
    "websiteUri" TEXT,
    "websiteClass" "WebsiteClass" NOT NULL,
    "websiteCheck" "WebsiteCheck" NOT NULL DEFAULT 'SKIPPED',
    "businessStatus" "BizStatus" NOT NULL DEFAULT 'UNKNOWN',
    "rating" DOUBLE PRECISION,
    "userRatingCount" INTEGER NOT NULL DEFAULT 0,
    "lastReviewAt" TIMESTAMP(3),
    "photoCount" INTEGER NOT NULL DEFAULT 0,
    "domainSuggested" TEXT,
    "domainAvailable" "DomainState" NOT NULL DEFAULT 'UNKNOWN',
    "affiliateUrl" TEXT,
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "disqualifiedReason" TEXT,
    "priorityScore" INTEGER NOT NULL DEFAULT 0,
    "outreachStatus" "OutreachStatus" NOT NULL DEFAULT 'NEW',
    "tpsCheckedAt" TIMESTAMP(3),
    "notes" TEXT,
    "siteSlug" TEXT,
    "siteGeneratedAt" TIMESTAMP(3),
    "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "searchRunId" TEXT,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchRun" (
    "id" TEXT NOT NULL,
    "occupation" TEXT NOT NULL,
    "town" TEXT,
    "centerLat" DOUBLE PRECISION,
    "centerLng" DOUBLE PRECISION,
    "radiusM" INTEGER,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "newCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_placeId_key" ON "Lead"("placeId");

-- CreateIndex
CREATE INDEX "Lead_occupation_town_idx" ON "Lead"("occupation", "town");

-- CreateIndex
CREATE INDEX "Lead_qualified_priorityScore_idx" ON "Lead"("qualified", "priorityScore");

-- CreateIndex
CREATE INDEX "Lead_websiteClass_idx" ON "Lead"("websiteClass");

-- CreateIndex
CREATE INDEX "Lead_outreachStatus_idx" ON "Lead"("outreachStatus");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "SearchRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
