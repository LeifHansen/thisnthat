import { NextResponse } from "next/server";
import { createListingForSeller, parseMinAutoAcceptCents } from "@/lib/createListing";
import { getMobileUser } from "@/lib/mobileAuth";
import { rateLimit } from "@/lib/rateLimit";
import { firstError, listingSchema } from "@/lib/validation";

// Create a listing from the app.
//
// The web equivalent is a server action (src/app/sell/actions.ts), which a
// native client can't call — it needs a cookie session and posts FormData to
// an endpoint Next generates. So this is the same work over JSON: same
// listingSchema, same createListingForSeller, so the two can't drift into
// publishing different rows.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // A listing is cheap to create and expensive to moderate, so this is tighter
  // than the read endpoints.
  const limited = rateLimit(req, "mobile-listings", 15, 60_000);
  if (limited) return limited;

  const seller = await getMobileUser(req);
  if (!seller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = listingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  const listing = await createListingForSeller(seller, parsed.data, {
    status: body.draft === true ? "DRAFT" : "ACTIVE",
    minAutoAcceptCents: parseMinAutoAcceptCents(body.minAutoAccept),
  });

  return NextResponse.json({ id: listing.id }, { status: 201 });
}
