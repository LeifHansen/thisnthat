-- Seller ship-from ZIP for live EasyPost rating of direct-sale shipping.
-- IF NOT EXISTS keeps this safe to re-run and tolerant of drift.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "shipFromPostalCode" TEXT;
