"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guards";
import { listingSchema, firstError } from "@/lib/validation";
import { parsePhotosField } from "@/lib/photos";
import { createListingForSeller, parseMinAutoAcceptCents } from "@/lib/createListing";

// Shared by the full Sell form and the first-listing wizard. `source=first`
// only changes where success lands (the tailored first-sale success screen).
export async function createListing(
  formData: FormData,
): Promise<{ error: string } | void> {
  const me = await requireUser();
  const intent =
    String(formData.get("intent") ?? "post") === "draft" ? "draft" : "post";
  const fromFirstListingWizard = String(formData.get("source") ?? "") === "first";

  const parsed = listingSchema.safeParse({
    title: formData.get("title"),
    beanieName: formData.get("beanieName"),
    description: formData.get("description") ?? "",
    condition: formData.get("condition"),
    year: formData.get("year") || undefined,
    price: formData.get("price"),
    quantity: formData.get("quantity") || undefined,
    authType: formData.get("authType"),
    photos: parsePhotosField(formData.get("photos")),
    coaImageUrl: formData.get("coaImageUrl") ?? "",
    trueBlueCertId: formData.get("trueBlueCertId") ?? "",
  });
  if (!parsed.success) {
    // Return (don't redirect): the wizard shows the message inline and the
    // seller keeps everything they typed.
    return { error: firstError(parsed.error) };
  }
  const d = parsed.data;

  const listing = await createListingForSeller(me, d, {
    status: intent === "draft" ? "DRAFT" : "ACTIVE",
    minAutoAcceptCents: parseMinAutoAcceptCents(formData.get("minAutoAccept")),
  });

  if (intent === "draft") {
    redirect(`/dashboard?draft=${listing.id}&toast=Draft+saved`);
  }
  redirect(
    `/sell/success?id=${listing.id}${fromFirstListingWizard ? "&first=1" : ""}`,
  );
}
