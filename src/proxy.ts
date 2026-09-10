import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

// Next 16 renamed the `middleware` convention to `proxy`.
// NOTE: proxy may run at the edge/CDN and shouldn't rely on shared globals;
// the in-memory limiter here is a best-effort prototype safeguard. Use a
// shared store (Redis/Upstash) for production-grade brute-force protection.
export function proxy(req: NextRequest) {
  if (
    req.method === "POST" &&
    req.nextUrl.pathname.endsWith("/callback/credentials")
  ) {
    const limited = rateLimit(req, "signin", 10, 60_000);
    if (limited) return limited;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/auth/:path*"],
};
