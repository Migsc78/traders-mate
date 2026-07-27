-- Certs redesign: file upload + expiry (not generated CP12/EICR PDFs)

DO $$ BEGIN
  ALTER TYPE "CertificateKind" ADD VALUE 'OTHER';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "CertificateStatus" ADD VALUE 'FILED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMP(3);
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "schemeRef" TEXT;
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "fileContentType" TEXT;
