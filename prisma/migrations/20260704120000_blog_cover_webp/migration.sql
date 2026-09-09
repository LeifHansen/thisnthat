-- Data-only follow-up to 20260704000000_fix_first_blog_cover: serve the blog
-- cover as the compressed WebP (198KB) instead of the 2.3MB source PNG. The
-- cover renders `unoptimized`, so the stored file's weight ships to every
-- reader as-is. Idempotent; no-op where no post uses the PNG path.
UPDATE "BlogPost"
SET "coverImageUrl" = '/goldbearhero.webp',
    "updatedAt" = NOW()
WHERE "coverImageUrl" = '/goldbearhero.png';
