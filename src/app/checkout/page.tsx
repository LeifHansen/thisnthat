import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { stripePublishableKey } from "@/lib/stripePublic";
import { CartCheckout } from "./CartCheckout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const session = await auth();

  let prefill = {
    name: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
  };
  if (session?.user?.id) {
    const u = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
      },
    });
    if (u) {
      prefill = {
        name: u.name ?? "",
        line1: u.addressLine1 ?? "",
        line2: u.addressLine2 ?? "",
        city: u.city ?? "",
        state: u.state ?? "",
        postalCode: u.postalCode ?? "",
      };
    }
  }

  return (
    <CartCheckout
      loggedIn={!!session?.user}
      email={session?.user?.email ?? ""}
      prefill={prefill}
      publishableKey={stripePublishableKey()}
    />
  );
}
