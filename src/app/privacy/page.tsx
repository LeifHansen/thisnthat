import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL, SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE_NAME} collects, uses, and protects your personal information.`,
  alternates: { canonical: "/privacy" },
};

const UPDATED = "September 9, 2026";

// Display form of the canonical origin, e.g. "thisnthat.fly.dev".
const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl mx-auto space-y-6 prose-like">
      <header className="space-y-2">
        <h1 className="text-3xl sm:text-4xl">Privacy Policy</h1>
        <p className="text-sm text-muted">Last updated: {UPDATED}</p>
      </header>

      <p>
        {SITE_NAME} (&ldquo;<strong>{SITE_NAME}</strong>,&rdquo;
        &ldquo;<strong>we</strong>,&rdquo; &ldquo;<strong>us</strong>,&rdquo; or
        &ldquo;<strong>our</strong>&rdquo;) operates the website at{" "}
        <Link href="/" className="!text-[var(--tnt-red)]">
          {SITE_HOST}
        </Link>{" "}
        (the &ldquo;<strong>Service</strong>&rdquo;), an online marketplace
        where members list and buy secondhand goods. This Privacy Policy
        explains what personal information we collect, how we use it, who we
        share it with, and the rights you have over it. By creating an account
        or otherwise using the Service, you agree to the practices described
        here.
      </p>

      <Section title="1. Information we collect">
        <p>We collect information in three ways:</p>
        <h3>1.1 Information you give us</h3>
        <ul>
          <li>
            <strong>Account information:</strong> name, email address, and
            password (stored only as a one-way bcrypt hash).
          </li>
          <li>
            <strong>Profile information:</strong> an optional display name,
            bio, and avatar image shown on your public profile.
          </li>
          <li>
            <strong>Shipping information:</strong> street address, city,
            state, ZIP/postal code, and country, used to ship orders to you
            and, for sellers, a ship-from ZIP used to rate shipping.
          </li>
          <li>
            <strong>Listing content:</strong> photos, titles, descriptions,
            condition notes, prices, and category details you submit when you
            create a listing.
          </li>
          <li>
            <strong>Orders, offers, reviews, and messages:</strong> the items
            you buy or sell, offers you make or receive, reviews you leave,
            and messages you exchange with other members through the Service.
          </li>
          <li>
            <strong>Communications:</strong> messages you send us through
            support channels.
          </li>
        </ul>

        <h3>1.2 Information from payments</h3>
        <p>
          Payments on {SITE_NAME} are processed by{" "}
          <strong>Stripe, Inc.</strong> We do not see, store, or transmit your
          full card number, CVC, or bank account details. Stripe provides us a
          token reference and the payment status (authorized, captured,
          refunded, failed). Sellers who set up payouts complete{" "}
          <strong>Stripe Connect</strong> onboarding directly with Stripe;
          that flow may collect identity and tax information governed by{" "}
          <a
            href="https://stripe.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="!text-[var(--tnt-red)] underline"
          >
            Stripe&apos;s Privacy Policy
          </a>
          .
        </p>

        <h3>1.3 Information collected automatically</h3>
        <ul>
          <li>
            <strong>Session cookies:</strong> a first-party cookie set by our
            sign-in system to keep you signed in.
          </li>
          <li>
            <strong>Analytics (Google Analytics 4), where configured:</strong>{" "}
            we may use Google Analytics 4 to understand aggregate site traffic
            &mdash; which pages people visit, how they arrived, and how long
            they stay. When enabled, Google Analytics sets first-party{" "}
            <code>_ga</code> / <code>_ga_*</code> cookies and sends
            pseudonymized event data to Google. We have not enabled Google
            Signals, Demographics, or advertising features. See{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="!text-[var(--tnt-red)] underline"
            >
              Google&apos;s Privacy Policy
            </a>{" "}
            for how Google handles this data. We do not use third-party
            advertising trackers.
          </li>
          <li>
            <strong>Server logs:</strong> IP address, user agent, request
            paths, timestamps, and response codes for security, abuse
            prevention, and debugging.
          </li>
        </ul>
      </Section>

      <Section title="2. How we use information">
        <ul>
          <li>To operate the Service: create accounts, host listings, process orders and offers, hold and release payments, and deliver messages between members.</li>
          <li>To rate shipping and purchase shipping labels for orders, and to track their delivery.</li>
          <li>To prevent fraud, identify counterfeit or prohibited listings, detect abuse, and enforce our Terms.</li>
          <li>To send transactional email (order status, shipment and delivery updates, offers, messages, payout notifications) and, unless you opt out, occasional product tips.</li>
          <li>To comply with legal obligations, respond to lawful requests, and protect our rights and the rights of others.</li>
        </ul>
        <p>
          We do <strong>not</strong> sell your personal information, and we do
          not use it for targeted advertising on or off our Service.
        </p>
      </Section>

      <Section title="3. Who we share information with">
        <p>We share the minimum information necessary with the following service providers:</p>
        <ul>
          <li>
            <strong>Stripe</strong> &mdash; payment processing, seller payouts,
            and anti-fraud.
          </li>
          <li>
            <strong>EasyPost</strong> &mdash; shipping rates, label purchase,
            and delivery tracking. The buyer&apos;s name and shipping address
            and the seller&apos;s ship-from address are shared to produce a
            label.
          </li>
          <li>
            <strong>SendGrid</strong> &mdash; delivery of transactional email
            to the address on your account.
          </li>
          <li>
            <strong>Cloudflare R2</strong> &mdash; storage of listing photos,
            avatars, and blog images you upload.
          </li>
          <li>
            <strong>Neon</strong> &mdash; managed PostgreSQL database hosting.
          </li>
          <li>
            <strong>Fly.io</strong> &mdash; application hosting.
          </li>
          <li>
            <strong>Google (Google Analytics 4)</strong>, where configured
            &mdash; pseudonymized usage analytics. We send page views and
            event metadata, not your account profile.
          </li>
          <li>
            <strong>Other members</strong> &mdash; when you buy, the seller
            receives your name and shipping address to fulfil the order; when
            you sell, the buyer sees your display name and profile. Messages
            you send are visible to their recipient.
          </li>
        </ul>
        <p>
          We may also disclose information when required by law, subpoena, or
          court order; to investigate fraud or violations of our Terms; or to
          protect the rights, property, or safety of {SITE_NAME}, our users,
          or the public. In the event of a merger, acquisition, or asset sale,
          your information may be transferred to the acquiring entity subject
          to this Privacy Policy.
        </p>
      </Section>

      <Section title="4. Cookies and tracking">
        <p>We use two categories of cookies:</p>
        <ul>
          <li>
            <strong>Strictly necessary:</strong> a first-party session cookie
            to keep you signed in. Blocking this will prevent sign-in.
          </li>
          <li>
            <strong>Analytics (Google Analytics 4), where configured:</strong>{" "}
            first-party <code>_ga</code> and <code>_ga_*</code> cookies that
            store a pseudonymized client identifier so Google Analytics can
            deduplicate page views and sessions. You can opt out using the{" "}
            <a
              href="https://tools.google.com/dlpage/gaoptout"
              target="_blank"
              rel="noopener noreferrer"
              className="!text-[var(--tnt-red)] underline"
            >
              Google Analytics Opt-out Browser Add-on
            </a>{" "}
            or by blocking these cookies in your browser.
          </li>
        </ul>
        <p>
          We do not embed third-party advertising trackers, retargeting
          pixels, or social-media widgets. You can clear or block any cookie
          through your browser at any time.
        </p>
      </Section>

      <Section title="5. Data retention">
        <p>
          We keep account, listing, order, and message records for as long as
          your account is active and for a reasonable period afterward to
          comply with tax, accounting, fraud-prevention, and
          dispute-resolution obligations. When you delete your account, your
          profile is scrubbed and your listings are removed; order records
          that form part of another member&apos;s purchase or sale history are
          retained in anonymized form.
        </p>
      </Section>

      <Section title="6. Security">
        <p>
          We use industry-standard safeguards: HTTPS everywhere, bcrypt password
          hashing, environment-isolated secrets, signed webhook verification,
          and least-privilege database access. No internet-based service is
          perfectly secure, and we cannot guarantee absolute security.
        </p>
      </Section>

      <Section title="7. Your rights">
        <p>You may at any time:</p>
        <ul>
          <li>Access the personal information in your account through your dashboard and settings.</li>
          <li>Correct or update your name, email, address, or profile information.</li>
          <li>Delete your account from your settings, or request export of your data.</li>
          <li>
            Opt out of any email category from your notification settings or
            via the unsubscribe link in any email. Transactional messages about
            an order in progress cannot be opted out of while that order is
            open.
          </li>
        </ul>
        <p>
          To exercise these rights, email{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="!text-[var(--tnt-red)] underline"
          >
            {SUPPORT_EMAIL}
          </a>
          . We respond within 30 days.
        </p>
      </Section>

      <Section title="8. California residents (CCPA / CPRA)">
        <p>
          If you reside in California, you have the right to (a) know what
          categories of personal information we collect and the purposes for
          which it is used; (b) request access to and deletion of your personal
          information; (c) opt out of any sale or sharing of your personal
          information; and (d) not be discriminated against for exercising
          these rights. We do not sell or share personal information as those
          terms are defined under the CCPA/CPRA.
        </p>
      </Section>

      <Section title="9. EU / UK residents (GDPR / UK GDPR)">
        <p>
          If you are in the European Economic Area or the United Kingdom, our
          lawful bases for processing your personal information are (i)
          performance of our contract with you (operating the marketplace),
          (ii) our legitimate interests in preventing fraud and improving the
          Service, (iii) compliance with legal obligations, and (iv) your
          consent for any purpose where consent is required. You have the
          right to access, rectify, erase, restrict, port, and object to
          processing of your personal data, and to lodge a complaint with your
          local data-protection authority.
        </p>
      </Section>

      <Section title="10. Children">
        <p>
          The Service is not directed to children under 13, and we do not
          knowingly collect personal information from anyone under 13. If you
          believe a child has provided us personal information, contact us and
          we will delete it.
        </p>
      </Section>

      <Section title="11. International transfers">
        <p>
          {SITE_NAME} is operated from the United States. By using the
          Service, you understand that your information may be transferred to
          and processed in the United States and other countries that may have
          different data-protection laws than your country of residence.
        </p>
      </Section>

      <Section title="12. Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. When we do, we
          will revise the &ldquo;Last updated&rdquo; date at the top and, for
          material changes, notify you by email or by posting a prominent
          notice on the Service. Continued use of the Service after a change
          constitutes acceptance of the updated policy.
        </p>
      </Section>

      <Section title="13. Contact">
        <p>
          Privacy questions:{" "}
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
