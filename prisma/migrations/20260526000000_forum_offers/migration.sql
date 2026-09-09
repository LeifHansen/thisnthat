-- BeanieX Forum + Make Offer / Auto-Accept
-- 1) Offers: enum, table, FKs, indexes, and minAutoAcceptCents on Listing.
-- 2) Forum: categories, threads, posts, votes, indexes, unique constraints.

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'AUTO_ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'SUPERSEDED'
);

-- AlterTable: Listing
ALTER TABLE "Listing" ADD COLUMN "minAutoAcceptCents" INTEGER;

-- CreateTable: Offer
CREATE TABLE "Offer" (
  "id"         TEXT NOT NULL,
  "listingId"  TEXT NOT NULL,
  "buyerId"    TEXT NOT NULL,
  "priceCents" INTEGER NOT NULL,
  "message"    TEXT,
  "status"     "OfferStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "orderId"    TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  "decidedAt"  TIMESTAMP(3),
  CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Offer_orderId_key" ON "Offer"("orderId");
CREATE INDEX "Offer_listingId_idx" ON "Offer"("listingId");
CREATE INDEX "Offer_buyerId_idx"   ON "Offer"("buyerId");
CREATE INDEX "Offer_status_idx"    ON "Offer"("status");

ALTER TABLE "Offer" ADD CONSTRAINT "Offer_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: ForumCategory
CREATE TABLE "ForumCategory" (
  "id"          TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "position"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForumCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ForumCategory_slug_key" ON "ForumCategory"("slug");

-- CreateTable: ForumThread
CREATE TABLE "ForumThread" (
  "id"                TEXT NOT NULL,
  "categoryId"        TEXT NOT NULL,
  "authorId"          TEXT,
  "authorDisplayName" TEXT,
  "title"             TEXT NOT NULL,
  "body"              TEXT NOT NULL,
  "score"             INTEGER NOT NULL DEFAULT 0,
  "isPinned"          BOOLEAN NOT NULL DEFAULT false,
  "isLocked"          BOOLEAN NOT NULL DEFAULT false,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ForumThread_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ForumThread_categoryId_idx" ON "ForumThread"("categoryId");
CREATE INDEX "ForumThread_score_idx"      ON "ForumThread"("score");
CREATE INDEX "ForumThread_createdAt_idx"  ON "ForumThread"("createdAt");

ALTER TABLE "ForumThread" ADD CONSTRAINT "ForumThread_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "ForumCategory"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForumThread" ADD CONSTRAINT "ForumThread_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: ForumPost
CREATE TABLE "ForumPost" (
  "id"                TEXT NOT NULL,
  "threadId"          TEXT NOT NULL,
  "authorId"          TEXT,
  "authorDisplayName" TEXT,
  "body"              TEXT NOT NULL,
  "score"             INTEGER NOT NULL DEFAULT 0,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ForumPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ForumPost_threadId_idx"  ON "ForumPost"("threadId");
CREATE INDEX "ForumPost_createdAt_idx" ON "ForumPost"("createdAt");

ALTER TABLE "ForumPost" ADD CONSTRAINT "ForumPost_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "ForumThread"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForumPost" ADD CONSTRAINT "ForumPost_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: ForumVote
CREATE TABLE "ForumVote" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "threadId"  TEXT,
  "postId"    TEXT,
  "value"     INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ForumVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ForumVote_userId_threadId_key" ON "ForumVote"("userId", "threadId");
CREATE UNIQUE INDEX "ForumVote_userId_postId_key"   ON "ForumVote"("userId", "postId");

ALTER TABLE "ForumVote" ADD CONSTRAINT "ForumVote_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForumVote" ADD CONSTRAINT "ForumVote_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "ForumThread"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForumVote" ADD CONSTRAINT "ForumVote_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "ForumPost"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: categories + stock threads (Prisma migrations are SQL-only, so we
-- inline the seed content here. Threads have NULL authorId and use
-- authorDisplayName "BeanieX Team" so deleting the demo user accounts
-- (per the demo-listings cleanup migration) does not orphan them.

INSERT INTO "ForumCategory" ("id", "slug", "name", "description", "position", "createdAt") VALUES
  ('cat_general',     'general',              'General Beanie Talk',  'Anything Beanie Baby — collecting tips, news, nostalgia, off-topic.', 1, CURRENT_TIMESTAMP),
  ('cat_auth',        'authentication-help',  'Authentication Help',  'Is it real? Tag generation questions, counterfeit markers, and authentication walkthroughs.', 2, CURRENT_TIMESTAMP),
  ('cat_rare',        'rare-and-vintage',     'Rare & Vintage',       'Original 9, Princess Diana, Royal Blue Peanut, recall variants, and other high-value finds.', 3, CURRENT_TIMESTAMP),
  ('cat_market',      'buying-and-selling',   'Buying & Selling',     'Value discussion, pricing trends, fair-offer culture, and marketplace etiquette.', 4, CURRENT_TIMESTAMP),
  ('cat_show',        'show-and-tell',        'Show & Tell',          'Post your collection, recent pickups, display setups, and proud-of-it grail Beanies.', 5, CURRENT_TIMESTAMP);

INSERT INTO "ForumThread"
  ("id", "categoryId", "authorId", "authorDisplayName", "title", "body", "score", "isPinned", "isLocked", "createdAt", "updatedAt")
VALUES
  ('thr_welcome',   'cat_general', NULL, 'BeanieX Team',
   'Welcome to the BeanieX Forum',
   'New here? Introduce yourself, share what got you into collecting, and tell us what you''re looking for. Be kind — we vote up helpful posts and down bad-faith ones, just like the rest of the internet pretends to.',
   12, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('thr_rules',     'cat_general', NULL, 'BeanieX Team',
   'Forum rules — short version',
   '1) No counterfeit sales talk. 2) No outside-platform sale offers (use Make Offer on the listing instead). 3) Use Authentication Help for is-this-real questions, not General. 4) Be civil. Mods will remove anything that violates these.',
   8, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('thr_nostalgia', 'cat_general', NULL, 'BeanieX Team',
   'What was your first Beanie Baby?',
   'Mine was Inky the Octopus (tan, no mouth) from a McDonald''s Happy Meal in 1998. What was yours, and do you still have it?',
   5, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('thr_tag_gen',   'cat_auth', NULL, 'BeanieX Team',
   'How to tell swing tag generations apart',
   'Quick reference: 1st gen tags (1993–1994) are single-sided with no star. 2nd gen (1994) added a star. 3rd gen (1995) added a yellow star and "Original Beanie Babies". 4th gen (1996–1997) red border tag. 5th gen (1998–1999) fancier font. Tag gen affects value massively — post a clear photo if you''re not sure.',
   18, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('thr_counterfeit','cat_auth', NULL, 'BeanieX Team',
   'Common counterfeit markers (READ BEFORE BUYING)',
   'Top three giveaways: 1) Mismatched swing/tush tag generations. 2) Tush tag has wrong country of origin for the year. 3) Embroidery is messy / fill feels wrong (plastic vs PE pellets). When in doubt, submit for BX Authentication or True Blue before paying serious money.',
   24, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('thr_princess',  'cat_rare', NULL, 'BeanieX Team',
   'Princess Diana bear — PVC vs PE pellets, indonesia vs china',
   'The Princess bear (1997 Diana commemorative) was made in both Indonesia (PVC pellets) and China (PE pellets). The PVC Indonesian version is technically rarer but BOTH versions are very common — the "I have a Princess Diana, I''m rich" myth needs to die. Most are worth $20–$50. Hang tag condition + authentication is what moves the needle.',
   31, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('thr_peanut',    'cat_rare', NULL, 'BeanieX Team',
   'Royal Blue Peanut — the real grail',
   'Royal Blue Peanut the Elephant (1995, dark blue colorway) is one of the few legitimately rare Beanies — only a small number were made before being changed to light blue. Authenticated examples regularly clear $1,500+. If you think you have one, get it authenticated before listing.',
   27, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('thr_original9', 'cat_rare', NULL, 'BeanieX Team',
   'The Original 9, ranked by current value',
   'Rough current order (mint w/ mint tag, authenticated): 1) Brownie (renamed Cubbie) 2) Patti the Platypus (royal-blue variant) 3) Squealer 4) Spot 5) Pinchers 6) Flash 7) Splash 8) Chocolate 9) Legs. Real values vary wildly by tag generation and condition — these are ballparks.',
   19, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('thr_offers',    'cat_market', NULL, 'BeanieX Team',
   'How to make a reasonable offer',
   'New: use the Make Offer button on any listing. Sellers can auto-accept above a threshold they set. A few rules of thumb: don''t lowball below 50% on tagged authenticated items; do lowball as-is items if you''re unsure of grade; include a short message explaining your offer (sellers respond better to context).',
   14, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('thr_pricing',   'cat_market', NULL, 'BeanieX Team',
   'Why your "rare" Beanie is probably not rare',
   'Hard truth: 99% of Beanie Babies on the secondary market are common pieces worth $5–$30. Rarity is driven by: 1) recall variants (peanut royal blue, etc.) 2) early tag generations (1st/2nd) 3) certified-mint condition. Without one of those three, it''s a $15 plush — and that''s ok!',
   22, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('thr_display',   'cat_show', NULL, 'BeanieX Team',
   'Best display cases for protecting tags',
   'For high-value pieces: tamper-resistant acrylic cases (the True Blue / BX sealed style) are the gold standard. For mid-tier: clear plastic tag protectors on the swing tag, displayed on open shelves out of direct sunlight. UV is the silent killer of red-bordered 4th-gen tags.',
   11, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('thr_recent',    'cat_show', NULL, 'BeanieX Team',
   'Post your most recent pickup',
   'Doesn''t have to be rare — just something you''re excited about. Mint condition Pinchers from a thrift store, a sealed-case authenticated Maple, or that "ten for a dollar" lot at a yard sale. Show us!',
   9, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
