-- Public profile customization: optional display name, bio, and avatar.
-- All columns nullable — no backfill, no data risk.
ALTER TABLE "User" ADD COLUMN "displayName" TEXT;
ALTER TABLE "User" ADD COLUMN "bio" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
