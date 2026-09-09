import type { MetadataRoute } from "next";

const SITE_URL = "https://beaniexchange.com";

// Allow Googlebot (and every other crawler) to index the entire public
// marketplace. Account and admin surfaces are disallowed here because they
// are sign-in gated: an unauthenticated crawler is redirected to
// `/auth/signin` before the page (and the site-wide analytics tag in the
// root layout) can render. Letting Google crawl them only produces redirect
// hits that surface as "Not tagged" pages in GA tag-coverage. These routes
// also carry per-page `robots: { index: false }` metadata as a backstop.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/dashboard",
          "/checkout",
          "/orders",
          "/messages",
          "/listings/*/edit",
          "/forum/*/new",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
