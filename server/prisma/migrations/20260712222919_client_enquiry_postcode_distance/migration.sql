-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "postcode" TEXT;

-- AlterTable
ALTER TABLE "Enquiry" ADD COLUMN     "distanceMiles" DOUBLE PRECISION,
ADD COLUMN     "postcode" TEXT;
