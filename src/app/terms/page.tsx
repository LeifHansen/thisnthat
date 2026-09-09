import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The rules and agreements that govern your use of the Beanie Xchange marketplace.",
  alternates: { canonical: "/terms" },
};

const UPDATED = "May 23, 2026";

export default function TermsPage() {
  return (
    <article className="max-w-3xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl sm:text-4xl">Terms of Service</h1>
        <p className="text-sm text-muted">Last updated: {UPDATED}</p>
      </header>

      <p>
        These Terms of Service (&ldquo;<strong>Terms</strong>&rdquo;) govern your
        access to and use of Beanie Xchange, an online marketplace for buying,
        selling, authenticating, and grading Beanie Babies (the &ldquo;
        <strong>Service</strong>&rdquo;), operated by Beanie Xchange (&ldquo;
        <strong>Beanie Xchange</strong>,&rdquo;
        &ldquo;<strong>we</strong>,&rdquo; &ldquo;<strong>us</strong>,&rdquo; or
        &ldquo;<strong>our</strong>&rdquo;). By creating an account, listing an
        item, placing a bid or purchase, or otherwise using the Service, you
        agree to be bound by these Terms and by our{" "}
        <Link href="/privacy" className="!text-[var(--bx-red)]">
          Privacy Policy
        </Link>
        . If you do not agree, do not use the Service.
      </p>

      <Section title="1. Eligibility">
        <p>
          You must be at least 18 years old (or the age of majority in your
          jurisdiction) and capable of forming a binding contract to use the
          Service. By using the Service, you represent and warrant that you
          meet these requirements and that the information you provide is
          accurate.
        </p>
      </Section>

      <Section title="2. Accounts">
        <p>
          You are responsible for safeguarding your account credentials and for
          all activity that occurs under your account. Notify us immediately of
          any unauthorized access. We may suspend or terminate accounts that
          violate these Terms or that we reasonably believe are involved in
          fraud, counterfeiting, or other abuse.
        </p>
      </Section>

      <Section title="3. The marketplace">
        <p>
          Beanie Xchange is a venue that connects buyers and sellers of Beanie
          Babies. We are not the seller of any item listed by a third party.
          For listings authenticated through Beanie Xchange Authentication,
          the item ships from our authentication center to the buyer, but
          Beanie Xchange does not take title to the goods at any point.
        </p>
        <h3>3.1 Listings</h3>
        <p>
          Sellers must accurately describe each item, including condition, tag
          state, year (where known), and authentication path (True Blue,
          third-party COA, BX Authenticated, or sold as-is). Sellers grant
          Beanie Xchange a non-exclusive, worldwide, royalty-free license to
          display listing content (photos, descriptions) on the Service and in
          related promotional surfaces (search, social previews, emails).
        </p>
        <h3>3.2 Prohibited items and conduct</h3>
        <ul>
          <li>Counterfeit, replica, or knowingly misrepresented Beanie Babies.</li>
          <li>Items that infringe Ty&nbsp;Inc.&apos;s or any third party&apos;s intellectual property rights.</li>
          <li>Items prohibited or restricted by applicable law.</li>
          <li>Listings that bypass the Beanie Xchange payment flow (off-platform sales).</li>
          <li>Fraud, manipulation of reviews or registry numbers, harassment, or any conduct that interferes with the Service.</li>
        </ul>
      </Section>

      <Section title="4. Authentication and grading">
        <p>
          Beanie Xchange Authentication is performed by trained authenticators
          against a known database of authentic Ty markers (embroidery, tag
          font and bend, fabric type, fill consistency, recall variants, and
          tush-tag printing). Our authentication is a good-faith opinion based
          on visual and tactile inspection. While we stand behind our results,
          authentication is not a guarantee or insurance against future
          determination by a third-party expert.
        </p>
        <p>
          Items submitted for authentication that fail are returned to the
          submitter with a written explanation. The $5 examination fee is
          non-refundable; inbound shipping is refunded only if the item is
          determined to have been a Beanie Xchange handling error.
        </p>
      </Section>

      <Section title="5. Payments, escrow, and fees">
        <p>
          All payments are processed by Stripe, Inc. Buyer funds are authorized
          at checkout and captured only when the buyer confirms receipt of an
          authenticated, undamaged item (for COA/BX listings) or when an item
          is delivered (for as-is direct-ship listings). Authentication-fee
          payments are captured immediately at checkout.
        </p>
        <p>
          Beanie Xchange charges sellers a platform fee on each sale (currently
          10%), deducted from the seller&apos;s proceeds — it is not added to the
          buyer&apos;s total. Buyers pay the item price plus shipping.
          Authentication fees are listed on the Authenticate page. Fees may
          change at any time; the fee in effect at the time of the transaction
          applies.
        </p>
        <p>
          Sellers receive payouts through Stripe Connect Express. Sellers are
          solely responsible for their own taxes and for accurately reporting
          income from sales on Beanie Xchange.
        </p>
      </Section>

      <Section title="6. Shipping, refunds, and disputes">
        <p>
          For BX-authenticated listings, items ship from our authentication
          center to the buyer with tracking and insurance. For True Blue and
          third-party COA listings, items ship directly seller-to-buyer. For
          as-is listings, the buyer assumes all risk; refunds are at the
          seller&apos;s discretion.
        </p>
        <p>
          If a BX-authenticated item fails post-sale authentication (e.g. the
          submitted item was swapped between approval and shipment), the
          escrow authorization is canceled and the buyer is refunded. If a
          shipment is lost or damaged in transit on a BX path, we will work
          with the carrier and refund or reship at our discretion. Disputes
          that cannot be resolved between buyer and seller may be escalated to
          our team; our determinations on authenticity and condition are
          final.
        </p>
      </Section>

      <Section title="7. BX Registry">
        <p>
          Items that complete BX Full Authentication may be issued a permanent
          registration number recorded in the public Beanie Xchange Registry.
          Registry numbers are tied to the item, not the owner, and remain
          valid across resales as long as the item retains its sealed
          packaging or its identity can be re-verified.
        </p>
      </Section>

      <Section title="8. Intellectual property">
        <p>
          &ldquo;Beanie Babies,&rdquo; &ldquo;Ty,&rdquo; and the Ty heart logo
          are trademarks of Ty&nbsp;Inc. Beanie Xchange is an independent
          aftermarket service and is not affiliated with, endorsed by, or
          sponsored by Ty&nbsp;Inc. All other trademarks, service marks, and
          logos on the Service belong to their respective owners.
        </p>
        <p>
          The Beanie Xchange name, logo (rainbow peace-sign bear), site
          design, and original site content are the property of Beanie
          Xchange. You may not copy, reproduce, or use them without our prior
          written permission.
        </p>
      </Section>

      <Section title="9. Termination">
        <p>
          You may close your account at any time. We may suspend or terminate
          your access to the Service at any time, with or without notice, for
          conduct that we reasonably believe violates these Terms, is harmful
          to other users, or exposes Beanie Xchange to legal or financial
          risk. Sections that by their nature should survive termination
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
          THAT ANY GIVEN ITEM&apos;S CONDITION OR AUTHENTICITY WILL MATCH
          EVERY BUYER&apos;S EXPECTATION. AUTHENTICATION IS AN INFORMED
          OPINION, NOT AN INSURANCE PRODUCT.
        </p>
      </Section>

      <Section title="11. Limitation of liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT WILL BEANIE
          XCHANGE OR ITS OFFICERS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY
          INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES,
          OR ANY LOSS OF PROFITS OR REVENUE, ARISING OUT OF OR RELATED TO YOUR
          USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM RELATED TO THE
          SERVICE WILL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID
          BEANIE XCHANGE IN FEES IN THE TWELVE MONTHS PRECEDING THE CLAIM, OR
          (B) USD $100.
        </p>
      </Section>

      <Section title="12. Indemnification">
        <p>
          You agree to indemnify, defend, and hold harmless Beanie Xchange
          from any claim, demand, loss, or expense (including reasonable
          attorneys&apos; fees) arising out of (a) your use of the Service,
          (b) your violation of these Terms, (c) your violation of any third
          party&apos;s rights (including intellectual-property rights), or (d)
          any item you list, sell, or submit for authentication.
        </p>
      </Section>

      <Section title="13. Governing law and dispute resolution">
        <p>
          These Terms are governed by the laws of the State of Washington,
          USA, without regard to its conflict-of-laws principles. The state
          and federal courts located in Clark County, Washington have
          exclusive jurisdiction over any dispute arising out of or related to
          these Terms or the Service, and you consent to personal jurisdiction
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
