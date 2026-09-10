import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Let every crawler index the public marketplace. Account, checkout and admin
// surfaces are sign-in gated (an unauthenticated crawler is redirected to
// /auth/signin before the page renders), so crawling them only produces
// redirect noise. Those routes also carry per-page `robots: { index: false }`
// metadata as a backstop.
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
          "/cart",
          "/checkout",
          "/orders",
          "/messages",
          "/unsubscribe",
          "/listings/*/edit",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
