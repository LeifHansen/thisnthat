import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { listingSchema, firstError } from "@/lib/validation";
import { parsePhotosField } from "@/lib/photos";
import { getCategory, readAttributes, validateAttributes } from "@/lib/categories";
import { categoryIdForSlug } from "@/lib/categoryStore";
import { publishEligibility } from "@/lib/sellerEligibility";
import { parseAttributesField, parseMinAutoAcceptCents } from "@/lib/createListing";
import { EditListingForm } from "@/components/EditListingForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit listing",
  robots: { index: false },
};

export default async function EditListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; reason?: string }>;
}) {
  const { id } = await params;
  const { error, reason } = await searchParams;
  const me = await requireUser();

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      category: { select: { slug: true } },
      lotItems: { select: { quantity: true } },
    },
  });
  if (!listing) notFound();
  // Only the owner may edit, and only their own listing.
  if (listing.sellerId !== me.id) redirect("/dashboard");
  // Sold listings are locked.
  if (listing.status === "SOLD") redirect(`/listings/${id}`);

  const lotPieces = listing.isLot
    ? listing.lotItems.reduce((n, it) => n + it.quantity, 0)
    : 0;

  async function updateListing(formData: FormData) {
    "use server";
    const user = await requireUser();
    const existing = await prisma.listing.findUnique({ where: { id } });
    if (!existing || existing.sellerId !== user.id) redirect("/dashboard");
    if (existing.status === "SOLD") redirect(`/listings/${id}`);

    // "Publish listing" on a draft. Only DRAFT → ACTIVE: REMOVED is owned by
    // moderation and this form must never override it. Saving without the
    // publish intent leaves a draft a draft.
    const publishing =
      existing.status === "DRAFT" &&
      String(formData.get("intent") ?? "") === "publish";

    // Explicitly typed so TypeScript treats each call as never-returning and
    // narrows `parsed` / `category` / `attrs` after it.
    const fail: (why: string) => never = (why) =>
      redirect(`/listings/${id}/edit?error=1&reason=${encodeURIComponent(why)}`);

    // A draft only goes live for a seller who can be paid; everything else
    // about the save still happens, so the edit is never lost.
    if (publishing) {
      const eligible = await publishEligibility(user.id);
      if (!eligible.ok) fail(eligible.message);
    }

    // A lot is one bundle: the single-item fields (brand, item name,
    // attributes) don't apply and whatever the form sends for them is ignored.
    const parsed = listingSchema.safeParse({
      title: formData.get("title"),
      categorySlug: formData.get("categorySlug"),
      brand: existing.isLot ? "" : (formData.get("brand") ?? ""),
      itemName: existing.isLot ? "" : (formData.get("itemName") ?? ""),
      description: formData.get("description") ?? "",
      condition: formData.get("condition"),
      attributes: existing.isLot ? {} : parseAttributesField(formData.get("attributes")),
      price: formData.get("price"),
      quantity: formData.get("quantity") || undefined,
      photos: parsePhotosField(formData.get("photos")),
    });
    if (!parsed.success) {
      console.error(
        "Listing update validation failed",
        parsed.error.flatten().fieldErrors,
      );
      fail(firstError(parsed.error));
    }
    const d = parsed.data;

    // Per-category attribute check (options, ranges, unknown keys dropped).
    const category = getCategory(d.categorySlug);
    if (!category) fail("Pick a category.");
    const attrs = validateAttributes(category, d.attributes);
    if (!attrs.ok) fail(attrs.error);
    const categoryId = await categoryIdForSlug(category.slug);

    // Optional seller auto-accept floor (integer cents, null = off).
    const minAutoAcceptCents = parseMinAutoAcceptCents(formData.get("minAutoAccept"));

    // `quantity` encodes live reservations (checkout decrements it), so an
    // absolute write from the form would erase any unit reserved since the
    // page rendered — inflating stock and overselling. Apply the seller's
    // change as a delta from the baseline the form was rendered with instead.
    const baseline = Number.parseInt(
      String(formData.get("quantityBaseline") ?? ""),
      10,
    );
    const quantityDelta =
      existing.isLot || !Number.isInteger(baseline)
        ? null // lots are always 1; no baseline = legacy tab, absolute write
        : d.quantity - baseline;

    const updated = await prisma.listing.updateMany({
      where: {
        id,
        // Publishing is a one-way DRAFT → ACTIVE step: if another tab already
        // published this listing, this write must not re-run the go-live work.
        ...(publishing ? { status: "DRAFT" as const } : {}),
        // A decrease may not take stock below what's actually left (some
        // units may be reserved by pending orders).
        ...(quantityDelta !== null && quantityDelta < 0
          ? { quantity: { gte: -quantityDelta } }
          : {}),
      },
      data: {
        ...(publishing ? { status: "ACTIVE" as const } : {}),
        title: d.title,
        categoryId,
        brand: existing.isLot ? null : d.brand || null,
        itemName: existing.isLot ? null : d.itemName || null,
        attributes: existing.isLot ? {} : attrs.attributes,
        description: d.description,
        condition: d.condition,
        priceCents: Math.round(d.price * 100),
        // A lot is a unique bundle: its quantity stays 1 regardless of what
        // the (hidden) fields submit.
        quantity: existing.isLot
          ? 1
          : quantityDelta === null
            ? d.quantity
            : { increment: quantityDelta },
        photos: d.photos,
        minAutoAcceptCents,
      },
    });
    if (updated.count === 0) {
      fail(
        publishing
          ? "This listing changed while you were editing — it may already be published. Reload the page to see where it stands."
          : "Stock changed while you were editing — a buyer just reserved a unit. Reload the page and adjust the quantity.",
      );
    }

    revalidatePath(`/listings/${id}`);
    revalidatePath("/dashboard");
    revalidatePath("/browse");
    redirect(
      `/listings/${id}?toast=${
        publishing ? "Listing+published" : "Listing+updated"
      }`,
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold">Edit listing</h1>
        <p className="text-muted text-sm">
          Update the details for <strong>{listing.title}</strong>.
        </p>
      </div>

      <EditListingForm
        updateListing={updateListing}
        saveError={error === "1"}
        saveErrorReason={reason}
        isLot={listing.isLot}
        lotSummary={
          listing.isLot
            ? `${lotPieces} ${lotPieces === 1 ? "item" : "items"} across ${listing.lotItems.length} ${listing.lotItems.length === 1 ? "line" : "lines"}`
            : undefined
        }
        initial={{
          id: listing.id,
          title: listing.title,
          categorySlug: listing.category.slug,
          brand: listing.brand ?? "",
          itemName: listing.itemName ?? "",
          condition: listing.condition,
          attributes: readAttributes(listing.attributes),
          description: listing.description,
          price: (listing.priceCents / 100).toFixed(2),
          quantity: String(listing.quantity),
          photos: listing.photos,
          minAutoAccept:
            listing.minAutoAcceptCents != null
              ? (listing.minAutoAcceptCents / 100).toFixed(2)
              : "",
          status: listing.status,
        }}
      />
    </div>
  );
}
