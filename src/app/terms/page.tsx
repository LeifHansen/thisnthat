import type { Metadata } from "next";
import Link from "next/link";
import { PLATFORM_FEE_LABEL } from "@/lib/fees";
import { SITE_NAME, SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The rules and agreements that govern your use of the ${SITE_NAME} marketplace.`,
  alternates: { canonical: "/terms" },
};

const UPDATED = "September 9, 2026";

export default function TermsPage() {
  return (
    <article className="max-w-3xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl sm:text-4xl">Terms of Service</h1>
        <p className="text-sm text-muted">Last updated: {UPDATED}</p>
      </header>

      <p>
        These Terms of Service (&ldquo;<strong>Terms</strong>&rdquo;) govern your
        access to and use of {SITE_NAME}, an online marketplace where anyone can
        list secondhand and pre-owned goods for sale and buy from other members
        (the &ldquo;<strong>Service</strong>&rdquo;), operated by {SITE_NAME}{" "}
        (&ldquo;<strong>{SITE_NAME}</strong>,&rdquo;
        &ldquo;<strong>we</strong>,&rdquo; &ldquo;<strong>us</strong>,&rdquo; or
        &ldquo;<strong>our</strong>&rdquo;). By creating an account, listing an
        item, making an offer, placing an order, or otherwise using the Service,
        you agree to be bound by these Terms and by our{" "}
        <Link href="/privacy" className="!text-[var(--tnt-red)]">
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link href="/returns" className="!text-[var(--tnt-red)]">
          Return &amp; Refund Policy
        </Link>
        . If you do not agree, do not use the Service.
      </p>

      <Section title="1. Eligibility">
        <p>
          You must be at least 18 years old (or the age of majority in your
          jurisdiction) and capable of forming a binding contract to use the
          Service. By using the Service, you represent and warrant that you
          meet these requirements and that the information you provide is
          accurate and kept up to date.
        </p>
      </Section>

      <Section title="2. Accounts">
        <p>
          You are responsible for safeguarding your account credentials and for
          all activity that occurs under your account. Notify us immediately of
          any unauthorized access. We may suspend or terminate accounts that
          violate these Terms or that we reasonably believe are involved in
          fraud, counterfeiting, or other abuse. You may close your account at
          any time from your account settings.
        </p>
      </Section>

      <Section title="3. The marketplace">
        <p>
          {SITE_NAME} is a venue that connects independent sellers with buyers.
          We are not the seller of any item listed by a member, we do not take
          title to goods at any point, and every sale is a contract between the
          buyer and the seller. Items ship directly from the seller to the
          buyer.
        </p>
        <h3>3.1 Listings</h3>
        <p>
          Sellers must accurately describe each item, including its condition,
          any flaws, what is included, and the category details the listing
          form asks for (size, era, working state, and so on). Photos must be
          of the actual item being sold. Sellers grant {SITE_NAME} a
          non-exclusive, worldwide, royalty-free license to display listing
          content (photos, descriptions) on the Service and in related
          promotional surfaces (search, social previews, emails).
        </p>
        <h3>3.2 No authentication or verification service</h3>
        <p>
          {SITE_NAME} does not inspect, grade, verify, or authenticate items.
          Any condition, brand, or provenance claim in a listing is the
          seller&apos;s alone. Sellers are solely responsible for the accuracy
          of their descriptions, and buyers should review photos and ask
          questions through messages before purchasing.
        </p>
        <h3>3.3 Prohibited items and conduct</h3>
        <ul>
          <li>Counterfeit, replica, or knowingly misrepresented goods.</li>
          <li>Stolen property, or items you do not have the right to sell.</li>
          <li>
            Weapons, ammunition, controlled substances, tobacco and vaping
            products, alcohol, prescription drugs, and medical devices.
          </li>
          <li>
            Recalled products, hazardous materials, and items that cannot be
            shipped by common carriers.
          </li>
          <li>
            Live animals, animal parts from protected species, and human
            remains.
          </li>
          <li>Adult content, and anything that infringes a third party&apos;s intellectual property rights.</li>
          <li>Items prohibited or restricted by applicable law.</li>
          <li>Listings that bypass the {SITE_NAME} checkout (off-platform sales, or steering a buyer to pay elsewhere).</li>
          <li>Fraud, manipulation of reviews or offers, harassment, or any conduct that interferes with the Service.</li>
        </ul>
        <p>
          We may remove any listing, cancel any order, or suspend any account
          that we reasonably believe violates this section.
        </p>
      </Section>

      <Section title="4. Offers and orders">
        <p>
          A buyer may purchase at the listed price or make an offer. An offer
          is a binding commitment to buy at that price if the seller accepts
          it (or if it meets a seller&apos;s auto-accept floor) before it
          expires. Once an order is placed the seller must ship the item
          promptly with tracking, and the buyer must not cancel except as
          described in section 6 and our Return &amp; Refund Policy.
        </p>
      </Section>

      <section id="fees" className="space-y-3">
        <h2 className="text-xl sm:text-2xl font-semibold pt-4">
          5. Fees &amp; payouts
        </h2>
        <div className="space-y-3 text-muted leading-relaxed">
          <p>
            <strong>Listing is free.</strong> There is no charge to create an
            account or to list an item, however many you list.
          </p>
          <p>
            <strong>Platform fee.</strong> When an item sells, {SITE_NAME}{" "}
            charges the seller a platform fee of{" "}
            <strong>{PLATFORM_FEE_LABEL} of the item price</strong>. The fee is
            deducted from the seller&apos;s proceeds; it is never added to the
            buyer&apos;s total. {SITE_NAME} also keeps the shipping amount it
            collects from the buyer, which is used to pay for the shipping
            label.
          </p>
          <p>
            <strong>What buyers pay.</strong> Buyers pay the item price plus
            shipping, as shown at checkout. No sales tax is collected by the
            Service at this time; buyers and sellers are responsible for any
            tax that applies to them.
          </p>
          <p>
            <strong>Payment hold.</strong> All payments are processed by
            Stripe, Inc. The buyer&apos;s card is authorized at checkout and
            the funds are held. They are captured only when the item is
            delivered &mdash; when the buyer confirms receipt in their
            dashboard or when the carrier reports delivery, whichever comes
            first. At that moment the seller&apos;s proceeds (item price minus
            the platform fee) are transferred to the seller&apos;s connected
            Stripe account.
          </p>
          <p>
            <strong>Seller payouts.</strong> To receive proceeds, a seller must
            complete Stripe Connect onboarding. Stripe may require identity
            and tax information as a condition of enabling payouts. If a sale
            completes before a seller has finished onboarding, the transfer is
            made once payouts are enabled. Sellers are solely responsible for
            their own taxes and for reporting income from sales on{" "}
            {SITE_NAME}.
          </p>
          <p>
            <strong>Changes.</strong> Fees may change at any time; the fee in
            effect when an order is placed applies to that order.
          </p>
        </div>
      </section>

      <Section title="6. Shipping, cancellations, refunds, and disputes">
        <p>
          Sellers ship directly to the buyer&apos;s address on the order and
          must add tracking to the order. Shipping labels may be purchased
          through the Service or supplied by the seller.
        </p>
        <p>
          <strong>Cancellations.</strong> Either party may cancel an order
          before it ships; the authorization on the buyer&apos;s card is
          released in full and no fee is charged. A seller who repeatedly
          cancels paid orders may be suspended.
        </p>
        <p>
          <strong>Refunds.</strong> If an item arrives materially not as
          described &mdash; the wrong item, undisclosed damage, or a
          misrepresented condition &mdash; the buyer may open a return within
          the window in our{" "}
          <Link href="/returns" className="!text-[var(--tnt-red)]">
            Return &amp; Refund Policy
          </Link>
          . Refunds are issued through the order&apos;s cancel/refund path to
          the original payment method. Once payment has been captured and paid
          out, a refund reverses the seller&apos;s transfer.
        </p>
        <p>
          <strong>Disputes.</strong> Buyers and sellers should first try to
          resolve issues through messages. Disputes that cannot be resolved
          may be escalated to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="!text-[var(--tnt-red)] underline">
            {SUPPORT_EMAIL}
          </a>
          . We will review the order, the listing, and the messages between
          the parties, and our determination on whether an item was
          materially as described is final for the purposes of the Service.
        </p>
      </Section>

      <Section title="7. Reviews and community content">
        <p>
          Buyers may leave a review after an order completes. Reviews must be
          honest and based on the buyer&apos;s own experience. Messages,
          reviews, profile text, and listing content must not be unlawful,
          harassing, or misleading. We may remove content that violates these
          Terms.
        </p>
      </Section>

      <Section title="8. Intellectual property">
        <p>
          The {SITE_NAME} name, logo, site design, and original site content
          are the property of {SITE_NAME}. You may not copy, reproduce, or use
          them without our prior written permission. Brand names that appear
          in listings belong to their respective owners; {SITE_NAME} is an
          independent resale marketplace and is not affiliated with, endorsed
          by, or sponsored by any brand whose products are listed here.
        </p>
      </Section>

      <Section title="9. Termination">
        <p>
          You may close your account at any time. We may suspend or terminate
          your access to the Service at any time, with or without notice, for
          conduct that we reasonably believe violates these Terms, is harmful
          to other users, or exposes {SITE_NAME} to legal or financial risk.
          Sections that by their nature should survive termination
          (intellectual property, disclaimers, limitations of liability,
          indemnification, governing law) will survive.
        </p>
      </Section>

      <Section title="10. Disclaimers">
        <p>
          THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
          AVAILABLE&rdquo; WITHOUT WARRANTY OF ANY KIND, WHETHER EXPRESS,
          IMPLIED, OR STATUTORY. WE DISCLAIM ALL IMPLIED WARRANTIES,
          INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
          PARTICULAR PURPOSE, NON-INFRINGEMENT, AND TITLE. WE DO NOT WARRANT
          THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE, OR
          THAT ANY ITEM LISTED BY A SELLER IS GENUINE, SAFE, OR AS DESCRIBED.
          WE DO NOT INSPECT OR VERIFY ITEMS.
        </p>
      </Section>

      <Section title="11. Limitation of liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT WILL{" "}
          {SITE_NAME.toUpperCase()} OR ITS OFFICERS, EMPLOYEES, OR AGENTS BE
          LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
          PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUE, ARISING OUT OF
          OR RELATED TO YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY
          CLAIM RELATED TO THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE
          AMOUNT YOU PAID {SITE_NAME.toUpperCase()} IN FEES IN THE TWELVE
          MONTHS PRECEDING THE CLAIM, OR (B) USD $100.
        </p>
      </Section>

      <Section title="12. Indemnification">
        <p>
          You agree to indemnify, defend, and hold harmless {SITE_NAME} from
          any claim, demand, loss, or expense (including reasonable
          attorneys&apos; fees) arising out of (a) your use of the Service,
          (b) your violation of these Terms, (c) your violation of any third
          party&apos;s rights (including intellectual-property rights), or (d)
          any item you list, sell, or buy.
        </p>
      </Section>

      <Section title="13. Governing law and dispute resolution">
        <p>
          These Terms are governed by the laws of the State of Washington,
          USA, without regard to its conflict-of-laws principles. The state
          and federal courts located in King County, Washington have exclusive
          jurisdiction over any dispute arising out of or related to these
          Terms or the Service, and you consent to personal jurisdiction
          there. The United Nations Convention on Contracts for the
          International Sale of Goods does not apply.
        </p>
      </Section>

      <Section title="14. Changes to these Terms">
        <p>
          We may update these Terms from time to time. We will revise the
          &ldquo;Last updated&rdquo; date and, for material changes, notify
          you through the Service or by email. Continued use of the Service
          after a change constitutes acceptance of the updated Terms.
        </p>
      </Section>

      <Section title="15. Contact">
        <p>
          Questions about these Terms:{" "}
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
        <Link href="/privacy" className="!text-[var(--tnt-red)]">
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link href="/returns" className="!text-[var(--tnt-red)]">
          Return &amp; Refund Policy
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
