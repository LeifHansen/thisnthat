import { NextResponse } from "next/server";
import {
  createListingForSeller,
  parseMinAutoAcceptCents,
  ListingInputError,
  type CreateListingResult,
} from "@/lib/createListing";
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
//
// Body (JSON), mirroring the web form field for field:
//   { title, categorySlug, brand?, itemName?, condition, attributes?: {[key]: string},
//     description?, price (dollars), quantity?, photos?: string[],
//     minAutoAccept? (dollars), intent?: "draft" | "post" }
// Responds 201 { id }.

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
  const parsed = listingSchema.safeParse({
    title: body.title,
    categorySlug: body.categorySlug,
    brand: body.brand ?? "",
    itemName: body.itemName ?? "",
    description: body.description ?? "",
    condition: body.condition,
    attributes: body.attributes ?? {},
    price: body.price,
    quantity: body.quantity || undefined,
    photos: body.photos ?? [],
  });
  if (!parsed.success) {
    return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  // `intent` matches the web form; `draft: true` is the older app field and
  // means the same thing.
  const intent = body.intent === "draft" || body.draft === true ? "draft" : "post";

  let listing: CreateListingResult;
  try {
    listing = await createListingForSeller(seller, parsed.data, {
      status: intent === "draft" ? "DRAFT" : "ACTIVE",
      minAutoAcceptCents: parseMinAutoAcceptCents(body.minAutoAccept),
    });
  } catch (e) {
    if (e instanceof ListingInputError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  // `held` is set when the app asked to publish but the seller's payouts
  // aren't enabled yet: the listing is a draft and the message says why.
  return NextResponse.json(
    { id: listing.id, status: listing.status, held: listing.held ?? null },
    { status: 201 },
  );
}
