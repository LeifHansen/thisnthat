import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Return & Refund Policy",
  description:
    "How returns, refunds, and disputes work on the Beanie Xchange marketplace across authenticated, True Blue, COA, and as-is listings.",
  alternates: { canonical: "/returns" },
};

const UPDATED = "July 1, 2026";

export default function ReturnsPage() {
  return (
    <article className="max-w-3xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl sm:text-4xl">Return &amp; Refund Policy</h1>
        <p className="text-sm text-muted">Last updated: {UPDATED}</p>
      </header>

      <p>
        Beanie Xchange is a marketplace that connects buyers and sellers of
        Beanie Babies. Because how a sale is fulfilled depends on how the item
        was listed, returns and refunds work differently for each listing type.
        This policy explains what to expect and how to start a return. It works
        alongside our{" "}
        <Link href="/terms" className="!text-[var(--bx-red)]">
          Terms of Service
        </Link>
        .
      </p>

      <Section title="1. Buyer protection at a glance">
        <p>
          Payments are held through Stripe escrow. For authenticated listings,
          your funds are captured only after you confirm receipt of an
          undamaged, authenticated item — so you are protected before the money
          ever leaves escrow. If something is wrong, contact us before
          confirming receipt.
        </p>
        <p>
          <strong>Returns are accepted within 3 days of delivery, subject to a
          $5 restocking fee</strong> deducted from your refund. The restocking
          fee is <strong>waived</strong> whenever the return is due to our
          error or a seller misrepresentation — for example, the wrong item,
          undisclosed damage, a failed post-sale authentication, or a package
          lost or damaged in transit. As-is listings are final sale (see
          section&nbsp;2.3).
        </p>
      </Section>

      <Section title="2. Returns by listing type">
        <h3>2.1 BX-Authenticated listings</h3>
        <p>
          These ship from our authentication center with tracking and
          insurance. If the item you receive does not match the authenticated
          condition and description — or fails post-sale authentication (for
          example, the item was swapped between approval and shipment) — you are
          eligible for a full refund. Report the issue within{" "}
          <strong>3 days of delivery</strong> and do not confirm receipt; the
          escrow authorization is canceled and you are refunded in full,
          including return shipping when the fault is ours.
        </p>
        <h3>2.2 True Blue &amp; third-party COA listings</h3>
        <p>
          These ship directly seller-to-buyer. If an item arrives materially
          not as described (wrong item, undisclosed damage, or a
          misrepresented tag or authentication state), you may open a dispute
          within <strong>3 days of delivery</strong>. Approved returns are
          refunded once the item is returned to the seller in its received
          condition; buyer-paid return shipping applies unless the item was
          misrepresented.
        </p>
        <h3>2.3 As-is listings</h3>
        <p>
          Items sold as-is are final sale. The buyer assumes all risk, and
          refunds are at the seller&apos;s sole discretion. We encourage buyers
          to review photos and ask questions before purchasing an as-is item.
        </p>
      </Section>

      <Section title="3. What is not covered">
        <ul>
          <li>Buyer&apos;s remorse or a change of mind on final-sale (as-is) items.</li>
          <li>Minor condition variance already disclosed in the listing.</li>
          <li>Items damaged after delivery or altered by the buyer.</li>
          <li>Off-platform sales that bypass the Beanie Xchange checkout.</li>
        </ul>
      </Section>

      <Section title="4. Authentication fees">
        <p>
          The examination fee for items submitted for authentication is
          non-refundable, including when an item fails authentication. Inbound
          shipping is refunded only if the item is determined to have been
          affected by a Beanie Xchange handling error. See the{" "}
          <Link href="/authenticate" className="!text-[var(--bx-red)]">
            Authenticate
          </Link>{" "}
          page for current fees.
        </p>
      </Section>

      <Section title="5. Lost or damaged in transit">
        <p>
          For items shipped on a Beanie Xchange path, if a package is lost or
          damaged in transit we will work with the carrier and, at our
          discretion, refund or reship. Keep all packaging and photograph any
          damage before contacting us.
        </p>
      </Section>

      <Section title="6. How to start a return">
        <ol>
          <li>
            Go to your{" "}
            <Link href="/dashboard" className="!text-[var(--bx-red)]">
              dashboard
            </Link>{" "}
            and open the relevant order.
          </li>
          <li>Message the seller, or contact us directly for authenticated orders.</li>
          <li>
            If unresolved, email{" "}
            <a
              href="mailto:support@beaniexchange.com"
              className="!text-[var(--bx-red)] underline"
            >
              support@beaniexchange.com
            </a>{" "}
            with your order number and photos. Our determinations on
            authenticity and condition are final.
          </li>
        </ol>
      </Section>

      <Section title="7. Refund timing">
        <p>
          Approved refunds are issued to your original payment method through
          Stripe, less the $5 restocking fee where it applies. Depending on your
          bank or card issuer, it may take <strong>5–10 business days</strong>{" "}
          for the credit to appear after we process it.
        </p>
      </Section>

      <Section title="8. Contact">
        <p>
          Questions about a return or refund:{" "}
          <a
            href="mailto:support@beaniexchange.com"
            className="!text-[var(--bx-red)] underline"
          >
            support@beaniexchange.com
          </a>
          .
        </p>
      </Section>

      <p className="text-sm text-muted">
        See also our{" "}
        <Link href="/terms" className="!text-[var(--bx-red)]">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="!text-[var(--bx-red)]">
          Privacy Policy
        </Link>
        .
      </p>
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl sm:text-2xl font-semibold pt-4">{title}</h2>
      <div className="space-y-3 text-muted leading-relaxed">{children}</div>
    </section>
  );
}
