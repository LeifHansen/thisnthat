import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { SHOP_COLLECTIONS, collectionHref } from "@/lib/collections";

const SITE_URL = "https://beaniexchange.com";

const STATIC_ROUTES: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
  { path: "/", changeFrequency: "daily", priority: 1.0 },
  { path: "/browse", changeFrequency: "hourly", priority: 0.9 },
  { path: "/database", changeFrequency: "weekly", priority: 0.8 },
  { path: "/price-trends", changeFrequency: "daily", priority: 0.8 },
  { path: "/beanie-info", changeFrequency: "monthly", priority: 0.7 },
  { path: "/beanie-info/error-tags", changeFrequency: "monthly", priority: 0.7 },
  { path: "/authenticate", changeFrequency: "weekly", priority: 0.9 },
  { path: "/authentication-process", changeFrequency: "monthly", priority: 0.8 },
  { path: "/rarity-guide", changeFrequency: "monthly", priority: 0.8 },
  // Verify-cert / BX Registry — disabled with in-house authentication:
  // { path: "/registry", changeFrequency: "daily", priority: 0.8 },
  { path: "/forum", changeFrequency: "hourly", priority: 0.8 },
  { path: "/blog", changeFrequency: "daily", priority: 0.7 },
  { path: "/sell", changeFrequency: "monthly", priority: 0.6 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.2 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
  { path: "/returns", changeFrequency: "yearly", priority: 0.2 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  // Curated shop-collection pages (/browse?collection=…). "all" is /browse,
  // which is already in STATIC_ROUTES.
  const collectionEntries: MetadataRoute.Sitemap = SHOP_COLLECTIONS.filter(
    (c) => c.key !== "all",
  ).map((c) => ({
    url: `${SITE_URL}${collectionHref(c)}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  // Public listings (ACTIVE + SOLD so historical-value pages stay indexable).
  // Wrapped in try/catch so missing DB at build time can't break the sitemap.
  let listings: { id: string; updatedAt: Date }[] = [];
  try {
    listings = await prisma.listing.findMany({
      where: { status: { in: ["ACTIVE", "SOLD"] } },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 5000,
    });
  } catch {
    listings = [];
  }
  const listingEntries: MetadataRoute.Sitemap = listings.map((l) => ({
    url: `${SITE_URL}/listings/${l.id}`,
    lastModified: l.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // Forum categories + threads
  let forumCats: { slug: string; createdAt: Date }[] = [];
  let forumThreads: { id: string; updatedAt: Date }[] = [];
  try {
    forumCats = await prisma.forumCategory.findMany({
      select: { slug: true, createdAt: true },
    });
    forumThreads = await prisma.forumThread.findMany({
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 5000,
    });
  } catch {
    /* DB unreachable at build time — keep static entries. */
  }
  const forumCatEntries: MetadataRoute.Sitemap = forumCats.map((c) => ({
    url: `${SITE_URL}/forum/${c.slug}`,
    lastModified: c.createdAt,
    changeFrequency: "daily",
    priority: 0.6,
  }));
  const forumThreadEntries: MetadataRoute.Sitemap = forumThreads.map((t) => ({
    url: `${SITE_URL}/forum/thread/${t.id}`,
    lastModified: t.updatedAt,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  // Published blog posts
  let blogPosts: { slug: string; updatedAt: Date }[] = [];
  try {
    blogPosts = await prisma.blogPost.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 5000,
    });
  } catch {
    /* DB unreachable at build time — keep static entries. */
  }
  const blogEntries: MetadataRoute.Sitemap = blogPosts.map((b) => ({
    url: `${SITE_URL}/blog/${b.slug}`,
    lastModified: b.updatedAt,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [
    ...staticEntries,
    ...collectionEntries,
    ...listingEntries,
    ...forumCatEntries,
    ...forumThreadEntries,
    ...blogEntries,
  ];
}
