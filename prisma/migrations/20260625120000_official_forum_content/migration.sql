-- Additional OFFICIAL forum content, authored by the "BeanieX Team" voice
-- (authorId NULL, authorDisplayName 'BeanieX Team') — the same pattern used to
-- seed the original forum threads. These are first-party guides, FAQs, and
-- announcements; no fake/independent user accounts are created.
--
-- Idempotent: every row uses a deterministic id and ON CONFLICT DO NOTHING so
-- re-running `migrate deploy` (or applying on an already-seeded DB) is a no-op.
-- Categories referenced (cat_general, cat_auth, cat_rare, cat_market, cat_show)
-- were created in 20260526000000_forum_offers.

INSERT INTO "ForumThread"
  ("id", "categoryId", "authorId", "authorDisplayName", "title", "body", "score", "isPinned", "isLocked", "createdAt", "updatedAt")
VALUES
  ('thr_dm_launch', 'cat_general', NULL, 'BeanieX Team',
   'New: Direct Messages are live',
   'You can now message other collectors directly. Open any listing and tap "Message seller" to start a conversation, or find all your chats under Messages in the top nav. Keep deals on-platform so escrow and buyer protection still apply.',
   16, true, false, CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '2 days'),

  ('thr_market_2026', 'cat_general', NULL, 'BeanieX Team',
   '2026 Beanie market update — what''s actually moving',
   'Quick read on the current secondary market: authenticated 1st/2nd-gen pieces and recall variants remain strong; common 4th/5th-gen plush is flat at $5–$30. Certified-mint condition is increasingly the deciding factor over raw rarity. Sealed-case authenticated lots are selling faster than loose ones. As always — condition + authentication move the needle far more than name alone.',
   9, false, false, CURRENT_TIMESTAMP - INTERVAL '6 days', CURRENT_TIMESTAMP - INTERVAL '6 days'),

  ('thr_tush_country', 'cat_auth', NULL, 'BeanieX Team',
   'Tush tag country-of-origin cheat sheet by year',
   'A mismatch between a tag generation and its country of origin is one of the fastest counterfeit tells. General guide: early/mid-90s production was largely China and Korea; later runs shifted to Indonesia. If a tag claims a year/style that doesn''t line up with where Ty was producing that piece, be cautious. Post clear photos of BOTH the swing and tush tag in Authentication Help and we''ll take a look.',
   13, true, false, CURRENT_TIMESTAMP - INTERVAL '9 days', CURRENT_TIMESTAMP - INTERVAL '9 days'),

  ('thr_photo_guide', 'cat_auth', NULL, 'BeanieX Team',
   'Photo guide: how to shoot tags for a fast authentication',
   'Faster, more accurate authentications start with good photos: 1) Bright, even, indirect light (no flash glare on plastic protectors). 2) Both sides of the swing tag, in focus. 3) The full tush tag, flattened. 4) A wide shot of the whole Beanie. 5) Close-ups of any seams/embroidery you''re unsure about. Blurry tag photos are the #1 cause of slow turnarounds.',
   10, false, false, CURRENT_TIMESTAMP - INTERVAL '12 days', CURRENT_TIMESTAMP - INTERVAL '12 days'),

  ('thr_firstgen', 'cat_rare', NULL, 'BeanieX Team',
   'Spotting a 1st-gen tag in the wild',
   '1st-gen swing tags (1993–1994) are single-sided, heart-shaped, with no star and a thinner font — and they''re where a lot of hidden value hides. Pair that with a matching 1st-gen tush tag (no red heart, "The Beanie Babies Collection") and you may have something worth authenticating. These rarely survive on kid-handled pieces, so condition is everything.',
   17, false, false, CURRENT_TIMESTAMP - INTERVAL '15 days', CURRENT_TIMESTAMP - INTERVAL '15 days'),

  ('thr_escrow', 'cat_market', NULL, 'BeanieX Team',
   'How escrow & buyer protection works on BeanieX',
   'When you buy, your payment is authorized and held in escrow — the seller is only paid out after you confirm you received the item as described. Sellers: connect a payout account from your dashboard to receive funds. Buyers: always keep the transaction on-platform; off-platform deals lose this protection entirely.',
   15, true, false, CURRENT_TIMESTAMP - INTERVAL '18 days', CURRENT_TIMESTAMP - INTERVAL '18 days'),

  ('thr_shipping', 'cat_market', NULL, 'BeanieX Team',
   'Shipping Beanies safely (so they arrive mint)',
   'Protect the tag first: a rigid tag protector, then wrap the Beanie in tissue, then a sealed poly bag to guard against moisture. Use a box, not a soft mailer, for anything tagged/authenticated — crushed swing tags are the most common "arrived not as described" complaint. Include tracking; it protects you as much as the buyer.',
   8, false, false, CURRENT_TIMESTAMP - INTERVAL '22 days', CURRENT_TIMESTAMP - INTERVAL '22 days'),

  ('thr_grail_month', 'cat_show', NULL, 'BeanieX Team',
   'Grail of the month — share yours',
   'Show us the one piece you''re proudest of, grail-tier or sentimental. Tell us the story: where you found it, condition, tag generation, whether it''s authenticated. We''ll feature a favorite each month.',
   7, false, false, CURRENT_TIMESTAMP - INTERVAL '25 days', CURRENT_TIMESTAMP - INTERVAL '25 days')
ON CONFLICT ("id") DO NOTHING;

-- A few official follow-up replies so guide threads aren't single-post stubs.
INSERT INTO "ForumPost"
  ("id", "threadId", "authorId", "authorDisplayName", "body", "score", "createdAt", "updatedAt")
VALUES
  ('pst_counterfeit_1', 'thr_counterfeit', NULL, 'BeanieX Team',
   'One more: counterfeit tush tags often use the wrong font weight and slightly off heart proportions. If the tag "feels" laser-printed rather than woven/printed in Ty''s style, slow down and get it authenticated.',
   4, CURRENT_TIMESTAMP - INTERVAL '5 days', CURRENT_TIMESTAMP - INTERVAL '5 days'),

  ('pst_princess_1', 'thr_princess', NULL, 'BeanieX Team',
   'To repeat the key point because it comes up constantly: a genuine Princess bear is usually $20–$50 unless it''s certified mint with a clean early tag. Authentication + condition is what creates value here, not the name.',
   6, CURRENT_TIMESTAMP - INTERVAL '4 days', CURRENT_TIMESTAMP - INTERVAL '4 days'),

  ('pst_escrow_1', 'thr_escrow', NULL, 'BeanieX Team',
   'Reminder for sellers: if your dashboard says "Finish Payout Setup," complete the Stripe steps before your first sale so payouts aren''t delayed when an order completes.',
   3, CURRENT_TIMESTAMP - INTERVAL '16 days', CURRENT_TIMESTAMP - INTERVAL '16 days')
ON CONFLICT ("id") DO NOTHING;
