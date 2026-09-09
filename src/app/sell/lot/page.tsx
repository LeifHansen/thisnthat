import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { SITE_NAME } from "@/lib/site";
import { lotSchema, firstError } from "@/lib/validation";
import { parsePhotosField } from "@/lib/photos";
import { parseMinAutoAcceptCents } from "@/lib/createListing";
import { categoryIdForSlug } from "@/lib/categoryStore";
import { LotWizard } from "@/components/LotWizard";

export const metadata: Metadata = {
  title: `Sell a lot — bundle several items for one price | ${SITE_NAME}`,
  description:
    "Selling a bundle? Group several items into one lot listing sold together for one price — a box of vintage tees, a shelf of paperbacks, a set of dishes.",
  alternates: { canonical: "/sell/lot" },
};

// Parse the JSON `items` field the client sends. Returns null on any problem so
// the schema reports a clean validation error instead of the action throwing.
function parseItems(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default async function SellLotPage() {
  const user = await requireUser();

  async function createLot(
    formData: FormData,
  ): Promise<{ error: string } | void> {
    "use server";
    const me = await requireUser();
    const intent =
      String(formData.get("intent") ?? "post") === "draft" ? "draft" : "post";

    const parsed = lotSchema.safeParse({
      title: formData.get("title"),
      categorySlug: formData.get("categorySlug"),
      description: formData.get("description") ?? "",
      condition: formData.get("condition"),
      price: formData.get("price"),
      photos: parsePhotosField(formData.get("photos")),
      items: parseItems(formData.get("items")),
    });
    if (!parsed.success) {
      // Return (don't redirect): the wizard shows the message inline and the
      // seller keeps everything they typed.
      return { error: firstError(parsed.error) };
    }
    const d = parsed.data;

    const status = intent === "draft" ? "DRAFT" : "ACTIVE";
    const categoryId = await categoryIdForSlug(d.categorySlug);

    // A lot is a single unique bundle: quantity is always 1 (it flips to SOLD
    // when bought), and its contents live in lotItems.
    const listing = await prisma.listing.create({
      data: {
        sellerId: me.id,
        title: d.title,
        categoryId,
        description: d.description,
        condition: d.condition,
        priceCents: Math.round(d.price * 100),
        quantity: 1,
        isLot: true,
        photos: d.photos,
        minAutoAcceptCents: parseMinAutoAcceptCents(formData.get("minAutoAccept")),
        status,
        lotItems: {
          create: d.items.map((it, i) => ({
            name: it.name,
            quantity: it.quantity,
            position: i,
          })),
        },
      },
      select: { id: true },
    });

    if (intent === "draft") {
      redirect(`/dashboard?draft=${listing.id}&toast=Lot+draft+saved`);
    }
    redirect(`/sell/success?id=${listing.id}`);
  }

  return <LotWizard userName={user.name} createLot={createLot} />;
}
