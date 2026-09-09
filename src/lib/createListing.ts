import "server-only";
import type { z } from "zod";
import { prisma } from "@/lib/db";
import { categoryIdForSlug } from "@/lib/categoryStore";
import { getCategory, validateAttributes } from "@/lib/categories";
import type { listingSchema } from "@/lib/validation";

/**
 * Creating a listing, shared by the web Sell form (src/app/sell/actions.ts)
 * and the app (src/app/api/mobile/listings/route.ts).
 *
 * The two callers differ only in how they get their input and where they send
 * the seller afterwards — a FormData post that redirects, versus a JSON post
 * that returns an id. What a listing *is* lives here: the category lookup, the
 * per-category attribute validation and the dollars-to-cents conversion.
 */
export type ListingInput = z.infer<typeof listingSchema>;

export class ListingInputError extends Error {}

export async function createListingForSeller(
  seller: { id: string },
  input: ListingInput,
  options: {
    /** A non-draft listing publishes immediately. */
    status: "DRAFT" | "ACTIVE";
    /** Seller's auto-accept floor in cents; null means every offer waits. */
    minAutoAcceptCents: number | null;
  },
): Promise<{ id: string }> {
  const category = getCategory(input.categorySlug);
  if (!category) throw new ListingInputError("Pick a category.");
  const attrs = validateAttributes(category, input.attributes);
  if (!attrs.ok) throw new ListingInputError(attrs.error);
  const categoryId = await categoryIdForSlug(category.slug);

  const listing = await prisma.listing.create({
    data: {
      sellerId: seller.id,
      title: input.title,
      categoryId,
      brand: input.brand || null,
      itemName: input.itemName || null,
      attributes: attrs.attributes,
      description: input.description,
      condition: input.condition,
      priceCents: Math.round(input.price * 100),
      quantity: input.quantity,
      photos: input.photos,
      minAutoAcceptCents: options.minAutoAcceptCents,
      status: options.status,
    },
    select: { id: true },
  });
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

/**
 * Parse the JSON `attributes` form field the wizards send. Anything that is
 * not a flat object comes back empty so the schema reports a clean error
 * rather than the action throwing.
 */
export function parseAttributesField(raw: unknown): Record<string, string> {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const obj: unknown = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = String(v ?? "");
    }
    return out;
  } catch {
    return {};
  }
}
