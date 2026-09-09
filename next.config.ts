import type { NextConfig } from "next";

// Host of R2_PUBLIC_URL (e.g. a custom domain like images.beaniexchange.com),
// so next/image can optimize photos even when the bucket is served from a
// custom domain rather than a pub-xxx.r2.dev host. Parsed at build time;
// falls back to just the r2.dev wildcard when the env var is unset (e.g. CI).
function r2PublicHost(): string | null {
  const raw = process.env.R2_PUBLIC_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

const nextConfig: NextConfig = {
  images: {
    // Listing photos live in R2 and were previously rendered with
    // `unoptimized`, shipping full-size 500KB–700KB JPEGs (12MB+ pages).
    // Allowlisting the R2 public host lets next/image resize + re-encode to
    // AVIF/WebP at the displayed width, cutting listing payload ~90%.
    remotePatterns: [
      { protocol: "https", hostname: "**.r2.dev" },
      ...(r2PublicHost()
        ? [{ protocol: "https" as const, hostname: r2PublicHost() as string }]
        : []),
    ],
    formats: ["image/avif", "image/webp"],
  },
  // Mirror of the optimizable host above, inlined into the client bundle so
  // components can tell whether next/image may optimize a given URL. Derived
  // from the same value as remotePatterns, so the two can't drift apart.
  env: { NEXT_PUBLIC_R2_PUBLIC_HOST: r2PublicHost() ?? "" },
  async headers() {
    return [
      {
        // Baseline security headers on every response. No full CSP (inline GA
        // and JSON-LD would need nonces), but the high-value clickjacking and
        // sniffing protections are cheap and safe.
        source: "/:path*",
        headers: [
          // One year, subdomains included; no preload so the commitment stays
          // reversible if the domain setup ever changes.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        // Long cache for static brand assets in /public (logos, backdrops).
        // These rarely change; the Next default (max-age=14400) gave a low
        // cache-hit rate in PageSpeed. Fingerprinted /_next/static is separate.
        source: "/:path*.(webp|svg|png|jpg|jpeg|gif|ico|avif)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        // Legacy path → RFC 9116 canonical location.
        source: "/security.txt",
        destination: "/.well-known/security.txt",
        permanent: true,
      },
      {
        // Canonicalize www → non-www (https). Pairs with Fly's force_https
        // (http → https in fly.toml) so every variant of the domain resolves
        // to a single canonical origin: https://beaniexchange.com. This turns
        // the www host into a hard 308 redirect instead of a 200 + canonical
        // tag, removing the duplicate host from Google's index entirely.
        source: "/:path*",
        has: [{ type: "host", value: "www.beaniexchange.com" }],
        destination: "https://beaniexchange.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
