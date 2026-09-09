import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { BX_BASIC_FEE_CENTS, formatCents } from "@/lib/fees";
import { stripePublishableKey } from "@/lib/stripePublic";
import { AuthWizard } from "@/components/AuthWizard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "BX Authentication — Submit your Beanie Babies ($5/beanie)",
  description:
    "Submit your Beanie Babies for in-house BX Authentication — $5 per beanie plus calculated shipping to us, return shipping included. Each beanie is authenticated, gets a numbered BX Authentic token, and is returned heat-sealed with a Certificate of Authenticity and a permanent BX Registry number.",
  alternates: { canonical: "/authenticate/bx" },
};

export default async function BxAuthenticatePage() {
  // In-app checkout requires an account. Signing in brings the submitter
  // straight back here rather than to the dashboard.
  const user = await requireUser("/authenticate/bx");

  // The return address is the profile address, when there is one — the same
  // prefill the cart checkout gets, so a returning submitter types nothing.
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      name: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
    },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header className="space-y-2">
        <p className="bx-badge text-[var(--bx-red)]">BX Authentication</p>
        <h1 className="text-3xl sm:text-4xl !text-ink">
          Submit for BX Authentication
        </h1>
        <p className="text-muted">
          {formatCents(BX_BASIC_FEE_CENTS)} per beanie + calculated shipping to
          us — return shipping included. We authenticate each beanie, attach a
          numbered “BX Authentic” token to it, and return it heat-sealed with a
          Certificate of Authenticity and a permanent BX Registry number.
        </p>
        <p className="text-xs text-muted">
          Prefer a third-party service?{" "}
          <Link
            href="/authenticate"
            className="!text-[var(--bx-red)] font-semibold"
          >
            Compare with True Blue Beans →
          </Link>
        </p>
      </header>

      <AuthWizard
        publishableKey={stripePublishableKey()}
        prefill={{
          name: me?.name,
          line1: me?.addressLine1,
          line2: me?.addressLine2,
          city: me?.city,
          state: me?.state,
          postalCode: me?.postalCode,
        }}
      />
    </div>
  );
}
