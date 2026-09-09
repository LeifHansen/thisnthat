import "server-only";
import type { z } from "zod";
import { prisma } from "@/lib/db";
import { recordCatalogueSubmission } from "@/lib/catalogue";
import type { listingSchema } from "@/lib/validation";

/**
 * Creating a listing, shared by the web Sell form (src/app/sell/actions.ts)
 * and the app (src/app/api/mobile/listings/route.ts).
 *
 * The two callers differ only in how they get their input and where they send
 * the seller afterwards — a FormData post that redirects, versus a JSON post
 * that returns an id. What a listing *is* lives here, so the app can't drift
 * into publishing subtly different rows: which fields survive by auth type,
 * the dollars-to-cents conversion, and the catalogue submission that has to
 * happen on publish but not on save-as-draft.
 */
export type ListingInput = z.infer<typeof listingSchema>;

export async function createListingForSeller(
  // The web's session user has an optional name; the app's always has one.
  // recordCatalogueSubmission already takes it nullable, so accept both.
  seller: { id: string; name?: string | null },
  input: ListingInput,
  options: {
    /** The authentication dropdown is a declaration, not a purchase — a
     *  non-draft listing publishes immediately. */
    status: "DRAFT" | "ACTIVE";
    /** Seller's auto-accept floor in cents; null means every offer waits. */
    minAutoAcceptCents: number | null;
  },
): Promise<{ id: string }> {
  const listing = await prisma.listing.create({
    data: {
      sellerId: seller.id,
      title: input.title,
      beanieName: input.beanieName,
      description: input.description,
      condition: input.condition,
      year: input.year ?? null,
      priceCents: Math.round(input.price * 100),
      quantity: input.quantity,
      authType: input.authType,
      photos: input.photos,
      // A COA image only means something on a third-party COA listing, and a
      // True Blue certificate id only on a True Blue one. Dropping the other
      // keeps a seller from switching type and leaving stale provenance
      // attached to the row.
      coaImageUrl:
        input.authType === "THIRD_PARTY_COA" ? input.coaImageUrl || null : null,
      trueBlueCertId:
        input.authType === "TRUE_BLUE" ? input.trueBlueCertId || null : null,
      minAutoAcceptCents: options.minAutoAcceptCents,
      status: options.status,
    },
  });

  // If this beanie isn't in the catalogue, record it for admin review. The
  // listing is already live — this is non-blocking and never fails a listing.
  // A draft records nothing yet; publishing it later does this same call.
  if (options.status === "ACTIVE") {
    await recordCatalogueSubmission({
      beanieName: input.beanieName,
      year: input.year ?? null,
      submittedByName: seller.name,
      listingId: listing.id,
    });
  }

  return { id: listing.id };
}

/**
 * Parse the seller's optional auto-accept floor (dollars, as typed) into
 * cents. Anything blank, non-numeric or non-positive means "no floor".
 */
export function parseMinAutoAcceptCents(raw: unknown): number | null {
  const text = String(raw ?? "").trim();
  if (text === "") return null;
  const dollars = Number(text);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return Math.round(dollars * 100);
}
