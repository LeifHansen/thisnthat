import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isSuperadmin } from "@/lib/guards";
import { rateLimit } from "@/lib/rateLimit";
import { isEbaySoldConfigured } from "@/lib/ebay-sold";
import { ingestBeanie } from "@/lib/sold-ingest";

// Superadmin-only: pull recent eBay sold listings for one beanie into SoldItem.
// One beanie per request (a single API call + upserts) so it stays well within
// serverless time limits; batch/backfill is scripts/ingest-sold.ts.
export async function POST(req: Request) {
  const limited = rateLimit(req, "sold-ingest", 30, 60_000);
  if (limited) return limited;

  const session = await auth();
  // Email match alone isn't enough — the account must actually hold the
  // ADMIN role, mirroring requireSuperadmin() on the page side.
  if (
    !session?.user ||
    session.user.role !== "ADMIN" ||
    !isSuperadmin(session.user)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isEbaySoldConfigured()) {
    return NextResponse.json(
      { error: "eBay sold-price API is not configured (RAPIDAPI_KEY missing)." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const name = (typeof body?.name === "string" ? body.name : "").trim().slice(0, 120);
  if (!name) {
    return NextResponse.json({ error: "Missing beanie name." }, { status: 400 });
  }

  try {
    const result = await ingestBeanie(name);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ingest failed.";
    // Surface upstream 4xx/5xx as a bad-gateway so the admin sees the reason.
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
