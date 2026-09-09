-- Listing inventory: units available, default 1 for every existing listing.
ALTER TABLE "Listing" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
