-- Client onboarding + Twilio provision tracking
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "twilioNumberSid" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "onboardingStep" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "onboardingDivertConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "onboardingTestCallAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "welcomeSmsSentAt" TIMESTAMP(3);
