-- Superadmin moderation flag. Added out-of-band to production ahead of this
-- migration, so guard with IF NOT EXISTS to keep `migrate deploy` idempotent
-- on prod while still creating the column on fresh/shadow databases.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suspended" BOOLEAN NOT NULL DEFAULT false;
