import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { lotSchema, firstError } from "@/lib/validation";
import { parsePhotosField } from "@/lib/photos";
import { LotWizard } from "@/components/LotWizard";

export const metadata: Metadata = {
  title: "Sell a Lot of Beanie Babies — Bundle Listing | Beanie Xchange",
  description:
    "Sell a lot of Beanie Babies on Beanie Xchange — bundle a mix of different beanies, or multiples of the same, into one listing sold together for one price. Escrow-protected checkout.",
  alternates: { canonical: "/sell/lot" },
  keywords: [
    "sell Beanie Baby lot",
    "Beanie Babies bulk lot",
    "Beanie Baby bundle for sale",
    "sell Beanie Babies in bulk",
  ],
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
      description: formData.get("description") ?? "",
      condition: formData.get("condition"),
      price: formData.get("price"),
      authType: formData.get("authType") || undefined,
      coaImageUrl: formData.get("coaImageUrl") ?? "",
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

    // Optional seller auto-accept floor (integer cents, null = off).
    const minAutoRaw = String(formData.get("minAutoAccept") ?? "").trim();
    const minAutoDollars = minAutoRaw === "" ? null : Number(minAutoRaw);
    const minAutoAcceptCents =
      minAutoDollars !== null &&
      Number.isFinite(minAutoDollars) &&
      minAutoDollars > 0
        ? Math.round(minAutoDollars * 100)
        : null;

    // A lot is a single unique bundle: quantity is always 1 (it flips to SOLD
    // when bought), and beanieName mirrors the title so admin search + review
    // aggregation have a stable, human-readable key.
    const listing = await prisma.listing.create({
      data: {
        sellerId: me.id,
        title: d.title,
        beanieName: d.title,
        description: d.description,
        condition: d.condition,
        priceCents: Math.round(d.price * 100),
        quantity: 1,
        isLot: true,
        authType: d.authType,
        photos: d.photos,
        coaImageUrl:
          d.authType === "THIRD_PARTY_COA" ? d.coaImageUrl || null : null,
        minAutoAcceptCents,
        status,
        lotItems: {
          create: d.items.map((it, i) => ({
            beanieName: it.beanieName,
            year: it.year ?? null,
            styleNumber: it.styleNumber ?? null,
            quantity: it.quantity,
            position: i,
          })),
        },
      },
    });

    if (intent === "draft") {
      redirect(`/dashboard?draft=${listing.id}&toast=Lot+draft+saved`);
    }
    redirect(`/sell/success?id=${listing.id}`);
  }

  return <LotWizard userName={user.name} createLot={createLot} />;
}
