import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { TrueBlueBadge } from "@/components/TrueBlueBadge";
import { outboundHref } from "@/lib/outbound";
import { BX_BASIC_FEE_CENTS, formatCents } from "@/lib/fees";

export const metadata: Metadata = {
  title: "Authenticate a Beanie Baby — BX Authentication or True Blue",
  description:
    "Authenticate your Beanie Babies. Choose in-house BX Authentication — $5 per beanie plus shipping to us, return shipping included, returned heat-sealed with a BX Authentic token and a Certificate of Authenticity — or submit to our partner True Blue Beans. Every authenticated beanie gets a permanent BX Registry number.",
  alternates: { canonical: "/authenticate" },
  keywords: [
    "Authenticate Beanie Babies",
    "Beanie Baby Authentication",
    "Beanie Baby COA",
    "BX Authentication",
    "Ty Beanie Baby authentication service",
    "True Blue Beans",
  ],
  openGraph: {
    title: "Authenticate a Beanie Baby — BX Authentication or True Blue",
    description:
      "In-house BX Authentication ($5/beanie + shipping to us, return included) or True Blue Beans. Sealed COA + permanent BX Registry #.",
    url: "/authenticate",
  },
};

export default function AuthenticatePage() {
  return (
    <div className="space-y-10">
      <section className="text-center space-y-4 max-w-2xl mx-auto">
        <span className="bx-badge text-yellow mx-auto">
          Beanie Xchange Authentication
        </span>
        <h1 className="text-4xl sm:text-5xl !text-ink">
          Get your Beanie Babies authenticated
        </h1>
        <p className="text-muted text-lg">
          Choose our in-house{" "}
          <span className="text-[var(--bx-red)] font-semibold">
            BX Authentication
          </span>{" "}
          — {formatCents(BX_BASIC_FEE_CENTS)} per beanie plus shipping to us,
          return shipping included — or submit to our partner{" "}
          <span className="text-cyan">True&nbsp;Blue&nbsp;Beans</span>. Every
          authenticated beanie gets a permanent BX Registry number.
        </p>
      </section>

      <section className="max-w-3xl mx-auto grid gap-4 sm:grid-cols-2">
        {/* BX in-house — in-app checkout */}
        <div className="bx-panel bx-panel--accent p-6 space-y-3 text-center flex flex-col">
          <div className="flex justify-center">
            <Image
              src="/brand/bx-heart-logo-v3.png"
              alt="BX Authentication"
              width={512}
              height={512}
              className="h-14 w-auto"
            />
          </div>
          <p className="font-display text-xl">BX Authentication</p>
          <p className="text-[var(--bx-red)] text-xs font-semibold">
            In-house · return shipping included
          </p>
          <p className="font-bold text-[var(--bx-red)] text-lg">
            {formatCents(BX_BASIC_FEE_CENTS)} / beanie + shipping to us
          </p>
          <ul className="text-muted text-sm space-y-1 max-w-xs mx-auto text-left">
            <li>· Authenticated in-house by our team</li>
            <li>· Numbered “BX Authentic” token attached to the beanie</li>
            <li>· Returned heat-sealed with a Certificate of Authenticity</li>
            <li>· Permanent BX Registry # — list as BX Authenticated</li>
          </ul>
          <div className="flex-1" />
          <Link href="/authenticate/bx" className="bx-btn w-full">
            Start BX Authentication →
          </Link>
          <p className="text-xs text-muted">
            Pay in-app, ship your beanies to us, and we return them
            authenticated. Shipping to us is calculated from your address —
            return shipping is included.
          </p>
        </div>

        {/* True Blue — third-party handoff */}
        <div className="bx-panel p-6 space-y-4 text-center flex flex-col">
          <div className="flex justify-center">
            <TrueBlueBadge size="md" source="authenticate" />
          </div>
          <p className="text-cyan text-xs font-semibold">
            Industry-standard third-party service
          </p>
          <ul className="text-muted text-sm space-y-1 max-w-xs mx-auto text-left">
            <li>· Submit directly on True Blue&apos;s site</li>
            <li>· True Blue COA in a tamper-evident case</li>
            <li>· Long-running third-party authentication service</li>
            <li>· List as True Blue Verified + BX Registry #</li>
          </ul>
          <div className="flex-1" />
          <a
            href={outboundHref("true-blue", "authenticate-intake")}
            target="_blank"
            rel="noopener noreferrer external"
            className="bx-btn bx-btn--ghost w-full"
          >
            View packages at True Blue Beans ↗
          </a>
          <p className="text-xs text-muted">
            Pricing and turnaround are set by True Blue Beans on their site.
          </p>
        </div>
      </section>

      <div className="text-center">
        <Link
          href="/authentication-process"
          className="!text-[var(--bx-red)] font-semibold text-sm"
        >
          See the full authentication process →
        </Link>
      </div>

      <section className="bx-panel p-8 text-center space-y-4 max-w-xl mx-auto">
        <p className="text-ink text-lg">
          Already have a certificate? List your beanie as authenticated — enter
          the cert ID when you create the listing.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/sell" className="bx-btn">
            Sell a Beanie
          </Link>
        </div>
      </section>
    </div>
  );
}
