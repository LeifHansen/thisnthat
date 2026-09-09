import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  HeartTagIcon,
  PeaceIcon,
  CoinIcon,
  BasketIcon,
} from "@/components/BrandIcons";
import {
  // BX in-house pricing — used by the commented-out native-grading panes below.
  // BX_BASIC_FEE_CENTS,
  // BX_FULL_FEE_CENTS,
  // BX_FULL_BULK_QTY,
  // BX_FULL_BULK_CENTS,
  FULL_SERVICE_FEE_CENTS,
  INBOUND_SHIP_CENTS,
  RETURN_SHIP_CENTS,
  formatCents,
} from "@/lib/fees";
import { outboundHref } from "@/lib/outbound";

export const metadata: Metadata = {
  title: "Beanie Baby Authentication Process — How It Works",
  description:
    "How Beanie Xchange authenticates your Beanie Babies through True Blue Beans — step by step, from ship-in to sealed acrylic display case with a numbered Certificate of Authenticity.",
  alternates: { canonical: "/authentication-process" },
};

const STEPS: { n: number; title: string; body: string }[] = [
  {
    n: 1,
    title: "You submit & pay",
    // Original copy while BX in-house tiers were live:
    // "Choose your track on Beanie Xchange. You can submit several beanies in
    //  one go. We collect your shipping address, each Beanie's name and
    //  condition, and your photos, then charge the service fee (True Blue: $18
    //  per beanie all-in, shipping included; BX Basic: $10 per beanie; BX Full
    //  + Grading: $20 per beanie, or 6 for $100). BX shipping and sales tax
    //  are calculated at checkout. You print the prepaid USPS label we email you."
    body:
      "Submit on Beanie Xchange — you can send several beanies in one go. We collect your shipping address, each Beanie's name and condition, and your photos, then charge the service fee ($18 per beanie; return shipping is calculated per order and sales tax is added at checkout). You print the prepaid USPS label we email you.",
  },
  {
    n: 2,
    title: "Ship to BX",
    body:
      "Pack the Beanie loosely with the hang tag protected (a stiff card sleeve or hard tag protector if you have one). Drop it at any USPS counter using the prepaid label. We track inbound shipments and email you when it arrives.",
  },
  {
    n: 3,
    title: "We drop-ship to True Blue Beans",
    body:
      "Through our True Blue Beans partnership, your Beanie goes directly to their authentication center. They cross-check it against the submission form, assign an individual Certificate of Authenticity (COA) number, and enter it into their database.",
  },
  {
    n: 4,
    title: "Swing tag examination",
    body:
      "True Blue inspects the swing tag (hang tag / paper tag) for: tag generation, gold trim, hole punch, punctuation, style number, and overall condition. The swing tag has direct impact on a Beanie's value — generation and condition matter as much as the plush itself.",
  },
  {
    n: 5,
    title: "Tush tag examination",
    body:
      "The tush tag (the sewn-in fabric tag) is examined separately — generation, country of origin, font, stitching, and the tag's own condition. A mismatch between swing and tush generations is one of the most common counterfeit markers.",
  },
  {
    n: 6,
    title: "Plush, stitching, and fill",
    body:
      "The Beanie itself is inspected for overall condition, stitching irregularities, fabric pilling, sun fade, fill consistency (PVC vs PE pellets), and any known production variations. Recall variants (peanut royal blue, old face vs new face) are noted.",
  },
  {
    n: 7,
    title: "Authentication outcome",
    body:
      "If authentic, a tag protector is placed on the swing tag and the Beanie is brushed clean of any lint. If counterfeit or inconclusive, you are notified with the specific markers; the item is returned with the COA fee non-refundable per True Blue's policy.",
  },
  {
    n: 8,
    title: "Sealed in a tamper-resistant case",
    body:
      "The authenticated Beanie is placed in an acid-free, clear acrylic display case. The case is ultra-sonically welded shut using a DuKane Ultrasonics welding machine. Voidable tamper-evident stickers are applied. The case cannot be reopened without visible destruction.",
  },
  {
    n: 9,
    title: "Certificate of Authenticity",
    body:
      "An embossed True Blue Beans Certificate is generated with the authentication date, Beanie name, swing-tag generation, tush-tag generation, style number, and any examiner comments. The COA is adhered to the bottom of the acrylic display case.",
  },
  {
    n: 10,
    title: "Shipped back to you",
    body:
      "Your sealed, authenticated Beanie is carefully packed and shipped to you via UPS with tracking. The sealed case + numbered COA means you can resell it as Authenticated on Beanie Xchange (or anywhere else) with a permanent BX Registry number that any buyer can verify.",
  },
];

export default function AuthenticationProcessPage() {
  const totalNoTax =
    FULL_SERVICE_FEE_CENTS + INBOUND_SHIP_CENTS + RETURN_SHIP_CENTS;

  return (
    <article className="max-w-3xl mx-auto space-y-10">
      <header className="space-y-3 text-center">
        <Image
          src="/brand/bx-heart-logo-v3.png"
          alt="Beanie Xchange"
          width={512}
          height={512}
          priority
          className="h-20 w-20 mx-auto object-contain"
        />
        <p className="bx-badge mx-auto">Authentication Process</p>
        <h1 className="text-4xl sm:text-5xl">
          How we authenticate your{" "}
          <span className="text-[var(--bx-red)]">Beanie Babies</span>
        </h1>
        <p className="text-muted max-w-2xl mx-auto">
          {/* While BX in-house tiers were live: "Beanie Xchange offers two
              Full Authentication tracks… The difference is who does the
              inspection — and what it costs." */}
          Every submission follows the same 10-step process below and results
          in a sealed Beanie with a numbered Certificate of Authenticity and a
          permanent entry in the BX Registry — inspected by our partner, True
          Blue Beans.
        </p>
        <div className="grid gap-3 max-w-md mx-auto pt-2 text-left">
          <div className="bx-panel p-4 space-y-1">
            <p className="font-display text-lg text-cyan">True Blue Beans</p>
            <p className="text-muted text-sm">
              Drop-shipped to{" "}
              <a
                href={outboundHref("true-blue", "auth-process")}
                target="_blank"
                rel="noopener noreferrer external"
                className="!text-cyan font-semibold"
              >
                True Blue Beans
              </a>{" "}
              — the industry-standard third party. Returned with a True Blue
              COA in their sealed acrylic case.
            </p>
          </div>
          {/* Native (BX in-house) authentication is disabled for now.
          <div className="bx-panel bx-panel--accent p-4 space-y-1">
            <p className="font-display text-lg text-[var(--bx-red)]">
              BX Authentication
            </p>
            <p className="text-muted text-sm">
              Authenticated in-house by the Beanie Xchange team. Same 10-step
              process, sealed BX COA — just{" "}
              <b>$10 per beanie + a flat $10 shipping</b> per order, no matter
              how many beanies you send.
            </p>
          </div>
          */}
        </div>
      </header>

      {/* Pricing */}
      <section className="bx-panel bx-panel--accent p-6 sm:p-8 space-y-6">
        <h2 className="text-2xl text-center">Authentication pricing</h2>
        <div className="grid gap-6 max-w-md mx-auto">
          <dl className="space-y-2 text-sm">
            <p className="font-display text-lg text-cyan text-center">
              True Blue Beans
            </p>
            <PriceRow
              label="Authentication (per beanie)"
              value={formatCents(FULL_SERVICE_FEE_CENTS)}
            />
            <PriceRow label="Shipping to us" value="included" />
            <PriceRow label="Return shipping" value="calculated per order" />
            <PriceRow label="Sales tax" value="at checkout" />
            <div className="border-t border-cyan pt-2 mt-2 flex justify-between font-display text-xl">
              <span>Subtotal</span>
              <span className="text-cyan font-semibold">
                {formatCents(totalNoTax)}+
              </span>
            </div>
          </dl>
          {/* Native (BX in-house) pricing — disabled for now.
          <dl className="space-y-2 text-sm">
            <p className="font-display text-lg text-[var(--bx-red)] text-center">
              BX Authentication
            </p>
            <PriceRow
              label="Basic (authenticate + tag + mylar baggie)"
              value={`${formatCents(BX_BASIC_FEE_CENTS)}/beanie`}
            />
            <PriceRow
              label="Full + Grading (grade /10, case, signed COA)"
              value={`${formatCents(BX_FULL_FEE_CENTS)}/beanie`}
            />
            <PriceRow
              label={`Full + Grading bulk (${BX_FULL_BULK_QTY} beanies)`}
              value={formatCents(BX_FULL_BULK_CENTS)}
            />
            <PriceRow label="Shipping" value="calculated at checkout" />
            <PriceRow label="Sales tax" value="at checkout" />
            <p className="text-muted text-xs pt-1">
              Pay the service fee now; shipping &amp; tax are added at the
              payment step based on your address.
            </p>
          </dl>
          */}
        </div>
        <p className="text-xs text-muted text-center">
          Shipping to us is calculated from your address at checkout and added
          to the service fee above; return shipping is included. The total shown
          on the payment screen is the full amount you are charged.
        </p>
        <div className="flex flex-wrap gap-3 justify-center pt-2">
          <Link href="/authenticate" className="bx-btn">
            <BasketIcon className="h-5 w-5" />
            Submit a Beanie for Authentication
          </Link>
          {/* Verify-cert entry point — disabled with in-house (BX) authentication:
          <Link href="/registry" className="bx-btn bx-btn--ghost">
            Verify a Registry #
          </Link>
          */}
        </div>
      </section>

      {/* The 10-step process */}
      <section className="space-y-5">
        <h2 className="text-2xl sm:text-3xl text-center">The 10-step process</h2>
        <ol className="space-y-3">
          {STEPS.map(({ n, title, body }) => (
            <li
              key={n}
              className="bx-panel p-5 flex gap-4 items-start"
            >
              <div className="bx-step bx-step--active shrink-0">{n}</div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-muted text-sm leading-relaxed">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* What's checked */}
      <section className="grid sm:grid-cols-2 gap-4">
        <div className="bx-panel p-5 space-y-2">
          <HeartTagIcon className="h-10 w-10" />
          <h3 className="font-display text-lg">Checked on every Beanie</h3>
          <ul className="text-sm text-muted space-y-1 list-disc list-inside">
            <li>Swing-tag generation, font, punctuation</li>
            <li>Gold trim, hole punch, style number</li>
            <li>Tush-tag generation, country, stitching</li>
            <li>Plush condition, fabric, fill (PVC vs PE)</li>
            <li>Known production variants and recalls</li>
            <li>Sun fade, pilling, tag bend or staining</li>
          </ul>
        </div>
        <div className="bx-panel p-5 space-y-2">
          <PeaceIcon className="h-10 w-10" />
          <h3 className="font-display text-lg">Not authenticated</h3>
          <p className="text-sm text-muted">
            Per True Blue Beans&apos; policy, the following items are not
            accepted for authentication:
          </p>
          <ul className="text-sm text-muted space-y-1 list-disc list-inside">
            <li>Upside-down buttons, noses, or pins on Beanies</li>
            <li>USA bears without the embroidered flag</li>
            <li>Beanies missing both tags</li>
          </ul>
        </div>
      </section>

      {/* About True Blue */}
      <section className="bx-panel p-6 space-y-2">
        <h2 className="text-xl">About True Blue Beans</h2>
        <p className="text-muted text-sm leading-relaxed">
          True Blue Beans is the long-running Beanie Baby authentication
          service that authenticators, dealers, and collectors recognize as
          the standard. Their COA is honored across the secondary market — on
          eBay, at toy shows, and in private resales. Beanie Xchange exists
          as the trusted online storefront on top of their proven process.
          You can verify any True Blue Beans certificate at{" "}
          <a
            href={outboundHref("true-blue", "auth-process-about")}
            target="_blank"
            rel="noopener noreferrer external"
            className="!text-[var(--bx-red)] font-semibold"
          >
            truebluebeans.com
          </a>
          .
        </p>
        <p className="text-xs text-muted">
          Process steps are summarised from True Blue Beans&apos; published
          authentication-process page. Beanie Xchange handles intake,
          payment, drop-ship to True Blue, and customer notifications; True
          Blue Beans performs the actual authentication and seals the case.
        </p>
      </section>

      <section className="text-center space-y-3">
        <div className="flex justify-center gap-6">
          <CoinIcon className="h-10 w-10" />
          <PeaceIcon className="h-10 w-10" />
          <HeartTagIcon className="h-10 w-10" />
        </div>
        <h2 className="text-2xl">Ready to authenticate?</h2>
        <Link href="/authenticate" className="bx-btn inline-flex">
          Submit a Beanie · {formatCents(totalNoTax)}+ tax
        </Link>
      </section>
    </article>
  );
}

function PriceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
