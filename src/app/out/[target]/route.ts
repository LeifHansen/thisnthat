import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { OUTBOUND_TARGETS, type OutboundTarget } from "@/lib/outbound";

export const dynamic = "force-dynamic";

/**
 * Tracked egress redirect: GET /out/<target>?src=<placement> records a click
 * and 302s to the partner site. Unknown targets fall back to the homepage
 * rather than becoming an open redirect.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ target: string }> },
) {
  const { target } = await params;
  const dest = OUTBOUND_TARGETS[target as OutboundTarget];
  if (!dest) return NextResponse.redirect(new URL("/", req.url));

  const source = req.nextUrl.searchParams.get("src")?.slice(0, 64) || null;
  try {
    await prisma.outboundClick.create({ data: { target, source } });
  } catch (e) {
    // Counting must never break the link — redirect even if the insert fails.
    console.error("outbound: failed to record click", e);
  }

  const res = NextResponse.redirect(dest, 302);
  // Every hit must reach this handler to be counted.
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}
