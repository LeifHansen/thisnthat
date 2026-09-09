"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guards";
import { listingSchema, firstError } from "@/lib/validation";
import { parsePhotosField } from "@/lib/photos";
import {
  createListingForSeller,
  parseAttributesField,
  parseMinAutoAcceptCents,
  ListingInputError,
} from "@/lib/createListing";

export async function createListing(
  formData: FormData,
): Promise<{ error: string } | void> {
  const me = await requireUser();
  const intent =
    String(formData.get("intent") ?? "post") === "draft" ? "draft" : "post";

  const parsed = listingSchema.safeParse({
    title: formData.get("title"),
    categorySlug: formData.get("categorySlug"),
    brand: formData.get("brand") ?? "",
    itemName: formData.get("itemName") ?? "",
    description: formData.get("description") ?? "",
    condition: formData.get("condition"),
    attributes: parseAttributesField(formData.get("attributes")),
    price: formData.get("price"),
    quantity: formData.get("quantity") || undefined,
    photos: parsePhotosField(formData.get("photos")),
  });
  if (!parsed.success) {
    // Return (don't redirect): the wizard shows the message inline and the
    // seller keeps everything they typed.
    return { error: firstError(parsed.error) };
  }

  let listing: { id: string };
  try {
    listing = await createListingForSeller(me, parsed.data, {
      status: intent === "draft" ? "DRAFT" : "ACTIVE",
      minAutoAcceptCents: parseMinAutoAcceptCents(formData.get("minAutoAccept")),
    });
  } catch (e) {
    if (e instanceof ListingInputError) return { error: e.message };
    throw e;
  }

  if (intent === "draft") {
    redirect(`/dashboard?draft=${listing.id}&toast=Draft+saved`);
  }
  redirect(`/sell/success?id=${listing.id}`);
}
