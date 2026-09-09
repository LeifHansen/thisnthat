-- One-time content fix (no schema change).
--
-- The first blog post (the one shown at the top of /blog) had a broken external
-- cover image. Repoint it at a local asset that ships in /public so it always
-- renders. Targets exactly the post that sorts first on the public blog
-- (most-recently published). No-op where there are no published posts yet
-- (e.g. the CI drift-check's throwaway database), so it's safe to replay.
UPDATE "BlogPost"
SET "coverImageUrl" = '/goldbearhero.png',
    "updatedAt" = NOW()
WHERE "id" = (
  SELECT "id" FROM "BlogPost"
  WHERE "status" = 'PUBLISHED'
  ORDER BY "publishedAt" DESC NULLS LAST, "createdAt" DESC
  LIMIT 1
);
