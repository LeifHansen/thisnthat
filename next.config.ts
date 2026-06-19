import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the Fly.io Docker image small.
  output: "standalone",
  images: {
    // Our own committed placeholder art is SVG; allow it through the optimizer.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      // Seed/placeholder imagery
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      // Cloudflare R2 public bucket (set R2_PUBLIC_HOST to your bucket host)
      ...(process.env.R2_PUBLIC_HOST
        ? [{ protocol: "https" as const, hostname: process.env.R2_PUBLIC_HOST }]
        : []),
    ],
  },
};

export default nextConfig;
