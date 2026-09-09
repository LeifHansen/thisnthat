import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Beanie Xchange collects, uses, and protects your personal information.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "May 23, 2026";

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl mx-auto space-y-6 prose-like">
      <header className="space-y-2">
        <h1 className="text-3xl sm:text-4xl">Privacy Policy</h1>
        <p className="text-sm text-muted">Last updated: {UPDATED}</p>
      </header>

      <p>
        Beanie Xchange (&ldquo;<strong>Beanie Xchange</strong>,&rdquo;
        &ldquo;<strong>we</strong>,&rdquo; &ldquo;<strong>us</strong>,&rdquo; or
        &ldquo;<strong>our</strong>&rdquo;) operates the website at{" "}
        <Link href="/" className="!text-[var(--bx-red)]">
          beaniexchange.com
        </Link>{" "}
        (the &ldquo;<strong>Service</strong>&rdquo;), an online marketplace for
        buying, selling, authenticating, and grading Beanie Babies. This
        Privacy Policy explains what personal information we collect, how we
        use it, who we share it with, and the rights you have over it. By
        creating an account or otherwise using the Service, you agree to the
        practices described here.
      </p>

      <Section title="1. Information we collect">
        <p>We collect information in three ways:</p>
        <h3>1.1 Information you give us</h3>
        <ul>
          <li>
            <strong>Account information:</strong> name, email address, password
            (stored only as a one-way bcrypt hash), and your purpose for using
            the Service (buying, selling, or both).
          </li>
          <li>
            <strong>Profile and shipping information:</strong> street address,
            city, state, and ZIP/postal code for shipping listings and
            authentication submissions.
          </li>
          <li>
            <strong>Listing content:</strong> photos, descriptions, condition
            notes, prices, certificate IDs, and other content you submit when
            you create a listing or authentication request.
          </li>
          <li>
            <strong>Communications:</strong> messages you send us through
            support channels.
          </li>
        </ul>

        <h3>1.2 Information from payments</h3>
        <p>
          Payments on Beanie Xchange are processed by{" "}
          <strong>Stripe, Inc.</strong> We do not see, store, or transmit your
          full card number, CVC, or bank account details. Stripe provides us a
          token reference, the last 4 digits of the payment method, and the
          payment status (authorized, captured, refunded, failed). Sellers who
          set up payouts complete{" "}
          <strong>Stripe Connect Express</strong> onboarding directly with
          Stripe; that flow may collect identity and tax information governed
          by{" "}
          <a
            href="https://stripe.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="!text-[var(--bx-red)] underline"
          >
            Stripe&apos;s Privacy Policy
          </a>
          .
        </p>

        <h3>1.3 Information collected automatically</h3>
        <ul>
          <li>
            <strong>Session cookies:</strong> a first-party cookie set by our
            authentication system to keep you signed in.
          </li>
          <li>
            <strong>Analytics cookies (Google Analytics 4):</strong> we use
            Google Analytics 4 to understand aggregate site traffic — which
            pages people visit, how they arrived, and how long they stay.
            Google Analytics sets first-party <code>_ga</code> /{" "}
            <code>_ga_*</code> cookies and sends pseudonymized event data to
            Google. IP addresses are truncated by Google for privacy. We have
            not enabled Google Signals, Demographics, or advertising features.
            See{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="!text-[var(--bx-red)] underline"
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
          <li>
            <strong>CDN telemetry:</strong> aggregate traffic and threat
            metrics from Cloudflare (our CDN/DNS provider).
          </li>
        </ul>
      </Section>

      <Section title="2. How we use information">
        <ul>
          <li>To operate the Service: create accounts, host listings, process orders, run escrow, route shipments, and issue certificates of authenticity.</li>
          <li>To authenticate, grade, and assign registry numbers to items submitted for Beanie Xchange Authentication.</li>
          <li>To prevent fraud, identify counterfeit listings, detect abuse, and enforce our Terms.</li>
          <li>To communicate transactional updates (order status, shipment, authentication results, payout notifications).</li>
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
            <strong>Stripe</strong> — payment processing, payouts, and
            anti-fraud.
          </li>
          <li>
            <strong>Neon</strong> — managed PostgreSQL database hosting.
          </li>
          <li>
            <strong>Fly.io</strong> — application hosting.
          </li>
          <li>
            <strong>Cloudflare</strong> — DNS, CDN, and edge security.
          </li>
          <li>
            <strong>Cloudflare R2</strong> — listing photo storage.
          </li>
          <li>
            <strong>Google (Google Analytics 4)</strong> — pseudonymized usage
            analytics. We send page views and event metadata, not your
            account profile.
          </li>
        </ul>
        <p>
          We may also disclose information when required by law, subpoena, or
          court order; to investigate fraud or violations of our Terms; or to
          protect the rights, property, or safety of Beanie Xchange, our users,
          or the public. In the event of a merger, acquisition, or asset sale,
          your information may be transferred to the acquiring entity subject
          to this Privacy Policy.
        </p>
      </Section>

      <Section title="4. Cookies and tracking">
        <p>
          We use two categories of cookies:
        </p>
        <ul>
          <li>
            <strong>Strictly necessary:</strong> a first-party session cookie
            to keep you signed in. Blocking this will prevent sign-in.
          </li>
          <li>
            <strong>Analytics (Google Analytics 4):</strong> first-party{" "}
            <code>_ga</code> and <code>_ga_*</code> cookies that store a
            pseudonymized client identifier so Google Analytics can deduplicate
            page views and sessions. You can opt out using the{" "}
            <a
              href="https://tools.google.com/dlpage/gaoptout"
              target="_blank"
              rel="noopener noreferrer"
              className="!text-[var(--bx-red)] underline"
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
          We keep account, listing, order, and authentication-request records
          for as long as your account is active and for a reasonable period
          afterward to comply with tax, accounting, fraud-prevention, and
          dispute-resolution obligations. You may request deletion of your
          account at any time, subject to legal retention requirements.
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
          <li>Access the personal information in your account through your dashboard.</li>
          <li>Correct or update your name, email, address, or profile information.</li>
          <li>Request export of your data or deletion of your account.</li>
          <li>Opt out of non-essential email; transactional messages cannot be opted out of while you have active orders.</li>
        </ul>
        <p>
          To exercise these rights, email{" "}
          <a
            href="mailto:privacy@beaniexchange.com"
            className="!text-[var(--bx-red)] underline"
          >
            privacy@beaniexchange.com
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
          Beanie Xchange is operated from the United States. By using the
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
            href="mailto:privacy@beaniexchange.com"
            className="!text-[var(--bx-red)] underline"
          >
            privacy@beaniexchange.com
          </a>
          .
        </p>
      </Section>

      <p className="text-sm text-muted">
        See also our{" "}
        <Link href="/terms" className="!text-[var(--bx-red)]">
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
