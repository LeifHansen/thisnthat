import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Return & Refund Policy",
  description: `How returns, refunds, cancellations, and disputes work on the ${SITE_NAME} marketplace.`,
  alternates: { canonical: "/returns" },
};

const UPDATED = "September 9, 2026";

// These numbers are mirrored by the MerchantReturnPolicy JSON-LD on the
// listing page (src/app/listings/[id]/page.tsx): 3-day window from delivery,
// return by mail, buyer pays return shipping, $5 restocking fee. Change them
// together.
const RETURN_WINDOW_DAYS = 3;
const RESTOCKING_FEE = "$5";

export default function ReturnsPage() {
  return (
    <article className="max-w-3xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl sm:text-4xl">Return &amp; Refund Policy</h1>
        <p className="text-sm text-muted">Last updated: {UPDATED}</p>
      </header>

      <p>
        {SITE_NAME} is a marketplace that connects independent sellers with
        buyers. Every item ships directly from the seller, and every sale is
        between the buyer and the seller. This policy explains what protection
        buyers have, when a return is accepted, and how to start one. It works
        alongside our{" "}
        <Link href="/terms" className="!text-[var(--tnt-red)]">
          Terms of Service
        </Link>
        .
      </p>

      <Section title="1. Buyer protection at a glance">
        <p>
          Your card is authorized at checkout, but the money is not captured
          &mdash; and the seller is not paid &mdash; until the item is
          delivered: when you confirm receipt in your dashboard, or when the
          carrier reports delivery, whichever comes first. If something is
          wrong with the item, contact the seller before confirming receipt.
        </p>
        <p>
          <strong>
            Returns are accepted within {RETURN_WINDOW_DAYS} days of delivery,
            subject to a {RESTOCKING_FEE} restocking fee
          </strong>{" "}
          deducted from your refund. Returns are sent back to the seller by
          mail, and the buyer pays return shipping. The restocking fee and
          return shipping are <strong>waived</strong> whenever the return is
          due to a seller misrepresentation &mdash; for example, the wrong
          item, undisclosed damage, or a condition materially worse than
          described.
        </p>
      </Section>

      <Section title="2. What qualifies for a return">
        <p>
          You may open a return within {RETURN_WINDOW_DAYS} days of delivery if
          the item:
        </p>
        <ul>
          <li>is not the item shown in the listing;</li>
          <li>has damage, wear, missing parts, or a fault that the listing did not disclose;</li>
          <li>is in a condition materially worse than the condition the seller selected;</li>
          <li>is a counterfeit or otherwise not what the listing claimed it to be; or</li>
          <li>never arrived, and the tracking shows it was not delivered.</li>
        </ul>
        <p>
          {SITE_NAME} does not inspect or verify items before sale, so the
          listing&apos;s photos, description, and condition are the standard a
          return is judged against.
        </p>
      </Section>

      <Section title="3. What is not covered">
        <ul>
          <li>Buyer&apos;s remorse or a change of mind, unless the seller agrees to take the item back.</li>
          <li>Minor condition variance already disclosed in the listing photos or description.</li>
          <li>Sizing or fit on apparel and shoes when the listed size was accurate.</li>
          <li>Items damaged after delivery or altered by the buyer.</li>
          <li>Returns opened after the {RETURN_WINDOW_DAYS}-day window has closed.</li>
          <li>Off-platform sales that bypass the {SITE_NAME} checkout.</li>
        </ul>
      </Section>

      <Section title="4. Cancellations before shipping">
        <p>
          Either the buyer or the seller may cancel an order before it ships.
          The authorization on your card is released in full and nothing is
          charged. Once the seller has added tracking, the order can no longer
          be cancelled; use the return process instead.
        </p>
      </Section>

      <Section title="5. Lost or damaged in transit">
        <p>
          If the tracking never shows delivery, or the package arrives
          damaged, contact the seller through messages within{" "}
          {RETURN_WINDOW_DAYS} days of the expected or actual delivery date.
          Keep all packaging and photograph any damage before contacting
          anyone. Lost and transit-damaged orders are refunded in full with
          no restocking fee.
        </p>
      </Section>

      <Section title="6. How to start a return">
        <ol>
          <li>
            Go to your{" "}
            <Link href="/dashboard" className="!text-[var(--tnt-red)]">
              dashboard
            </Link>{" "}
            and open the relevant order.
          </li>
          <li>
            Message the seller from the order page, describing the problem
            and including photos. Most issues are resolved directly between
            buyer and seller.
          </li>
          <li>
            If you and the seller agree on a return, ship the item back to the
            seller with tracking. The refund is issued once the seller
            receives it in the condition it was delivered.
          </li>
          <li>
            If you cannot reach agreement, email{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="!text-[var(--tnt-red)] underline"
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            with your order number and photos. We review the listing, the
            order, and your messages, and our determination on whether the
            item was materially as described is final.
          </li>
        </ol>
      </Section>

      <Section title="7. Refund timing">
        <p>
          Refunds are issued through the order&apos;s cancel/refund path to
          your original payment method via Stripe, less the {RESTOCKING_FEE}{" "}
          restocking fee where it applies. If the payment had not yet been
          captured, the authorization is simply released. Depending on your
          bank or card issuer, it may take <strong>5&ndash;10 business days</strong>{" "}
          for the credit to appear after it is processed.
        </p>
      </Section>

      <Section title="8. For sellers">
        <p>
          Accurate listings are your best protection. Photograph flaws, pick
          the condition honestly, and answer buyer questions before the sale.
          A return that is approved because an item was not as described is
          refunded from your proceeds, and repeated not-as-described returns
          may lead to suspension.
        </p>
      </Section>

      <Section title="9. Contact">
        <p>
          Questions about a return or refund:{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="!text-[var(--tnt-red)] underline"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <p className="text-sm text-muted">
        See also our{" "}
        <Link href="/terms" className="!text-[var(--tnt-red)]">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="!text-[var(--tnt-red)]">
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
