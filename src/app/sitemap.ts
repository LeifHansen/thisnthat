import type { MetadataRoute } from "next";
import { sellerPath } from "@/lib/handles";
import { prisma } from "@/lib/db";
import { CATEGORIES } from "@/lib/categories";
import { SITE_URL } from "@/lib/site";

// Regenerate hourly rather than baking the listing set in at build time.
export const revalidate = 3600;

type Freq = MetadataRoute.Sitemap[number]["changeFrequency"];

const STATIC_ROUTES: { path: string; changeFrequency: Freq; priority: number }[] = [
  { path: "/", changeFrequency: "daily", priority: 1.0 },
  { path: "/browse", changeFrequency: "hourly", priority: 0.9 },
  { path: "/browse?type=lots", changeFrequency: "hourly", priority: 0.8 },
  { path: "/sell", changeFrequency: "monthly", priority: 0.7 },
  { path: "/blog", changeFrequency: "daily", priority: 0.7 },
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

  const categoryEntries: MetadataRoute.Sitemap = CATEGORIES.map((c) => ({
    url: `${SITE_URL}/browse?category=${c.slug}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  // Every DB read is wrapped so an unreachable database (e.g. at build time)
  // degrades to the static entries instead of failing the whole sitemap.
  let listings: { id: string; updatedAt: Date }[] = [];
  try {
    listings = await prisma.listing.findMany({
      where: { status: "ACTIVE" },
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

  let blogPosts: { slug: string; updatedAt: Date }[] = [];
  try {
    blogPosts = await prisma.blogPost.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 5000,
    });
  } catch {
    blogPosts = [];
  }
  const blogEntries: MetadataRoute.Sitemap = blogPosts.map((b) => ({
    url: `${SITE_URL}/blog/${b.slug}`,
    lastModified: b.updatedAt,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  // Public seller profiles: accounts in good standing with something for sale.
  let sellers: { id: string; updatedAt: Date }[] = [];
  try {
    sellers = await prisma.user.findMany({
      where: {
        suspended: false,
        deletedAt: null,
        listings: { some: { status: "ACTIVE" } },
      },
      select: { id: true, handle: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 2000,
    });
  } catch {
    sellers = [];
  }
  const sellerEntries: MetadataRoute.Sitemap = sellers.map((u) => ({
    url: `${SITE_URL}${sellerPath(u)}`,
    lastModified: u.updatedAt,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  return [
    ...staticEntries,
    ...categoryEntries,
    ...listingEntries,
    ...blogEntries,
    ...sellerEntries,
  ];
}
