-- AlterTable
CREATE TYPE "SearchMode" AS ENUM ('SITE_BUILD', 'SAAS_BETA');

-- AlterTable
ALTER TABLE "SearchRun" ADD COLUMN "mode" "SearchMode" NOT NULL DEFAULT 'SITE_BUILD';
