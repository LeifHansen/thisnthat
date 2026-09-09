-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('TRUE_BLUE', 'BX_AUTHENTICATION');

-- CreateEnum
CREATE TYPE "RegistryIssuer" AS ENUM ('TRUE_BLUE', 'BX_AUTHENTICATION');

-- AlterTable: provider on AuthenticationRequest (existing rows = TRUE_BLUE, the original partnership)
ALTER TABLE "AuthenticationRequest" ADD COLUMN "provider" "AuthProvider" NOT NULL DEFAULT 'TRUE_BLUE';

-- AlterTable: issuer + externalCertId on RegistryEntry
-- Existing rows: all issued via the True Blue partnership (admin pass flow recorded the TB cert in reviewNotes only).
ALTER TABLE "RegistryEntry" ADD COLUMN "issuer" "RegistryIssuer" NOT NULL DEFAULT 'BX_AUTHENTICATION';
ALTER TABLE "RegistryEntry" ADD COLUMN "externalCertId" TEXT;

-- Backfill: every pre-existing registry entry came from the True Blue pipeline.
-- (Going forward, BX_AUTHENTICATION is the default for new in-house entries.)
UPDATE "RegistryEntry" SET "issuer" = 'TRUE_BLUE';

-- CreateIndex
CREATE INDEX "RegistryEntry_externalCertId_idx" ON "RegistryEntry"("externalCertId");
CREATE INDEX "RegistryEntry_issuer_idx" ON "RegistryEntry"("issuer");
