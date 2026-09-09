import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { listingSchema, firstError } from "@/lib/validation";
import { parsePhotosField } from "@/lib/photos";
import { recordCatalogueSubmission } from "@/lib/catalogue";
import { EditListingForm } from "@/components/EditListingForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit listing — Beanie Xchange",
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
    include: { lotItems: { select: { quantity: true } } },
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

    // "Publish listing" on a draft. Only DRAFT → ACTIVE: every other status
    // (PENDING_AUTH, REMOVED) is owned by the authentication and moderation
    // flows, and this form must never override them. Saving without the
    // publish intent leaves a draft a draft.
    const publishing =
      existing.status === "DRAFT" &&
      String(formData.get("intent") ?? "") === "publish";

    // Sellers may update how the item's authenticity is backed (service +
    // cert / registry number) — same self-declared trust level as the sell
    // wizard. Lots stay limited to as-is / third-party COA (per-beanie certs
    // don't apply to a mixed bundle); anything unexpected keeps the old type.
    const requestedAuth = String(formData.get("authType") ?? "");
    const allowedAuth = existing.isLot
      ? ["THIRD_PARTY_COA", "UNAUTHENTICATED"]
      : ["TRUE_BLUE", "BX_FULL_SERVICE", "THIRD_PARTY_COA", "UNAUTHENTICATED"];
    const authType = allowedAuth.includes(requestedAuth)
      ? requestedAuth
      : existing.authType;

    const parsed = listingSchema.safeParse({
      title: formData.get("title"),
      beanieName: formData.get("beanieName"),
      description: formData.get("description") ?? "",
      condition: formData.get("condition"),
      year: formData.get("year") || undefined,
      price: formData.get("price"),
      quantity: formData.get("quantity") || undefined,
      authType,
      trueBlueCertId: formData.get("trueBlueCertId") ?? "",
      registrationNumber: formData.get("registrationNumber") ?? "",
      coaImageUrl: formData.get("coaImageUrl") ?? "",
      photos: parsePhotosField(formData.get("photos")),
    });
    if (!parsed.success) {
      console.error(
        "Listing update validation failed",
        parsed.error.flatten().fieldErrors,
      );
      const why = firstError(parsed.error);
      redirect(`/listings/${id}/edit?error=1&reason=${encodeURIComponent(why)}`);
    }
    const d = parsed.data;

    // Optional seller auto-accept floor (integer cents, null = off).
    const minAutoRaw = String(formData.get("minAutoAccept") ?? "").trim();
    const minAutoDollars = minAutoRaw === "" ? null : Number(minAutoRaw);
    const minAutoAcceptCents =
      minAutoDollars !== null &&
      Number.isFinite(minAutoDollars) &&
      minAutoDollars > 0
        ? Math.round(minAutoDollars * 100)
        : null;

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

    // Cert fields follow the chosen service; the others are cleared so a
    // stale badge can't outlive a service switch. In-house BX review data
    // (bxCertId, grade) is kept only while the listing stays BX-authenticated.
    const authChanged = d.authType !== existing.authType;
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
        // A lot is a unique bundle: its beanieName mirrors the title and its
        // quantity stays 1 regardless of what the (hidden) fields submit.
        beanieName: existing.isLot ? d.title : d.beanieName,
        description: d.description,
        condition: d.condition,
        year: existing.isLot ? null : (d.year ?? null),
        priceCents: Math.round(d.price * 100),
        quantity: existing.isLot
          ? 1
          : quantityDelta === null
            ? d.quantity
            : { increment: quantityDelta },
        photos: d.photos,
        minAutoAcceptCents,
        authType: d.authType,
        trueBlueCertId:
          d.authType === "TRUE_BLUE" ? d.trueBlueCertId || null : null,
        registrationNumber:
          d.authType === "BX_FULL_SERVICE"
            ? d.registrationNumber || null
            : null,
        coaImageUrl:
          d.authType === "THIRD_PARTY_COA" ? d.coaImageUrl || null : null,
        ...(authChanged && existing.authType === "BX_FULL_SERVICE"
          ? { bxCertId: null, grade: null }
          : {}),
      },
    });
    if (updated.count === 0) {
      redirect(
        `/listings/${id}/edit?error=1&reason=${encodeURIComponent(
          publishing
            ? "This listing changed while you were editing — it may already be published. Reload the page to see where it stands."
            : "Stock changed while you were editing — a buyer just reserved a unit. Reload the page and adjust the quantity.",
        )}`,
      );
    }

    // Going live is the moment a new beanie enters the admin review queue —
    // the sell wizard does this for listings that publish immediately, and a
    // published draft has to reach the queue the same way. Lots are exempt:
    // their beanieName mirrors the bundle title, not a catalogue beanie.
    if (publishing && !existing.isLot) {
      await recordCatalogueSubmission({
        beanieName: d.beanieName,
        year: d.year ?? null,
        submittedByName: user.name,
        listingId: id,
      });
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
            ? `${lotPieces} ${lotPieces === 1 ? "beanie" : "beanies"} across ${listing.lotItems.length} ${listing.lotItems.length === 1 ? "type" : "types"}`
            : undefined
        }
        initial={{
          id: listing.id,
          title: listing.title,
          beanieName: listing.beanieName,
          year: listing.year != null ? String(listing.year) : "",
          condition: listing.condition,
          description: listing.description,
          price: (listing.priceCents / 100).toFixed(2),
          quantity: String(listing.quantity),
          photos: listing.photos,
          minAutoAccept:
            listing.minAutoAcceptCents != null
              ? (listing.minAutoAcceptCents / 100).toFixed(2)
              : "",
          authType: listing.authType,
          status: listing.status,
          registrationNumber: listing.registrationNumber,
          trueBlueCertId: listing.trueBlueCertId,
          coaImageUrl: listing.coaImageUrl,
          grade: listing.grade,
        }}
      />
    </div>
  );
}
