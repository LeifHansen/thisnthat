import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Beanie Info — How to Identify, Value & Authenticate Beanie Babies",
  description:
    "Helpful Beanie Baby information for collectors: the truth about Beanie Baby values, swing-tag and tush-tag generations, what makes a Beanie rare, condition grading, the 'error tag' myth, how to spot fakes, and how to price yours.",
  alternates: { canonical: "/beanie-info" },
  keywords: [
    "Beanie Baby information",
    "Beanie Baby tag generations",
    "Beanie Baby value",
    "rare Beanie Babies",
    "Beanie Baby errors",
    "fake vs authentic Beanie Babies",
    "how to value Beanie Babies",
  ],
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-bold">{title}</h2>
      <div className="space-y-3 text-[var(--bx-ink-soft)] leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function BeanieInfoPage() {
  return (
    <article className="max-w-3xl mx-auto space-y-10">
      <header className="space-y-3 text-center">
        <p className="bx-badge mx-auto">Beanie Info</p>
        <h1 className="text-4xl sm:text-5xl">
          Helpful <span className="text-[var(--bx-red)]">Beanie Baby</span>{" "}
          Information
        </h1>
        <p className="text-muted max-w-2xl mx-auto">
          A plain-English primer on what actually drives Beanie Baby value — tag
          generations, rarity, condition, and the myths to ignore. It reads a
          little like a &ldquo;Beanieology 101&rdquo; course; it takes time to
          learn, and we&apos;re here to help.
        </p>
      </header>

      <Section title="The truth about Beanie Baby values">
        <p>
          If you&apos;re here because of a viral article claiming a common Beanie
          is worth tens of thousands of dollars, take a breath: roughly 99% of
          those &ldquo;rarest Beanie Babies&rdquo; lists are clickbait. The
          Beanies pictured are usually ordinary $5 plush. A handful of Beanies
          genuinely carry high value, but they are the exception, not the rule.
        </p>
        <p>
          There are no official Beanie Baby &ldquo;appraisers.&rdquo; Value is
          set by what authentic, desirable examples actually sell for. The
          honest summary: <strong>if you have desirable Beanies, they will
          sell; if you don&apos;t, they won&apos;t.</strong>
        </p>
      </Section>

      <Section title="Tag generations (the #1 thing collectors check)">
        <p>
          Every Beanie has two tags, and collectors care about both — but the{" "}
          <strong>swing tag</strong> (the paper heart-shaped hang tag) is
          primary, and the <strong>tush tag</strong> (the sewn-in fabric tag) is
          secondary.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Swing tags (Gen 1–~20):</strong> early generations
            (1st–3rd) are skinnier, single-fold or have a different font and no
            star. The 4th generation introduced the familiar yellow star. Earlier
            generations on an early Beanie generally mean higher value.
          </li>
          <li>
            <strong>Tush tags:</strong> generation, country of origin, font, and
            stitching all matter. A mismatch between swing-tag and tush-tag
            generation is one of the most common counterfeit markers.
          </li>
        </ul>
        <p>
          Generation and condition of the tag can matter as much as the plush
          itself — a creased or missing swing tag drops value significantly.
        </p>
      </Section>

      <Section title="What actually makes a Beanie valuable">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Genuine rarity / short production:</strong> early retired
            pieces (e.g., certain old-face Teddies, Peking, Chilly, Humphrey,
            Trap, Web) are scarce and command real money.
          </li>
          <li>
            <strong>Early tag generation</strong> on an early Beanie.
          </li>
          <li>
            <strong>Specific variations:</strong> color, pellet type, or
            construction differences (e.g., Princess PVC vs PE, all-black Zip,
            tan Inky) that collectors track.
          </li>
          <li>
            <strong>Condition:</strong> mint plush with a mint, protected swing
            tag.
          </li>
        </ul>
      </Section>

      <Section title="The &ldquo;error tag&rdquo; myth">
        <p>
          Most so-called &ldquo;errors&rdquo; — misspellings, missing stars,
          stamped dates, gasket/spacing quirks — are extremely common factory
          variations and add little or no value. The famous
          &ldquo;Millennium/Millenium&rdquo; spelling and typical 4th/5th-gen
          tag quirks are <em>not</em> the jackpot the internet promises. Be
          skeptical of any listing whose entire pitch is &ldquo;rare error
          tag.&rdquo;
        </p>
        <p>
          <Link
            href="/beanie-info/error-tags"
            className="!text-red font-semibold"
          >
            Read the full breakdown of error tags, birth dates &amp; values →
          </Link>
        </p>
      </Section>

      <Section title="Common Beanies that are hard to sell">
        <p>
          These were produced in enormous quantities and have little resale
          value regardless of tag claims: 4th-generation and later{" "}
          <strong>Valentino, Claude, Halo, Peace</strong> bears, most{" "}
          <strong>Jake</strong>, and many late 4th/5th-gen releases. New common
          Beanies are added to these lists regularly.
        </p>
      </Section>

      <Section title="Condition &amp; grading">
        <p>
          Collectors look for mint condition: clean, un-faded plush; no pilling,
          odors, or pellet clumping; and an attached, crease-free swing tag
          (ideally in a tag protector). Sun fade, smoke smell, and tag damage
          all reduce value. Professional grading — like the sealed, numbered
          grade you get through Beanie Xchange — gives buyers confidence in
          exactly what they&apos;re purchasing.
        </p>
      </Section>

      <Section title="How to price your Beanies">
        <p>
          Don&apos;t price from asking listings — anyone can ask any amount.
          Price from <strong>completed/SOLD</strong> sales (for example, eBay
          &ldquo;Sold&rdquo; listings), and learn to filter out the fakes that
          also sell. A dedicated price guide and the collector community are
          your best references for anything unusual.
        </p>
      </Section>

      <Section title="Spotting fakes">
        <p>
          Counterfeits are common, especially for the valuable pieces. Watch for
          swing/tush-tag generation mismatches, fuzzy or off-color tag printing,
          incorrect fonts, wrong pellet type, sloppy stitching, and colors that
          don&apos;t match known authentic examples. When real money is on the
          line, get it authenticated rather than guessing.
        </p>
      </Section>

      <section className="bx-panel bx-panel--accent p-6 text-center space-y-3">
        <h2 className="text-xl font-bold">Not sure what you have?</h2>
        <p className="text-muted text-sm max-w-xl mx-auto">
          Look it up in our database, or send it in for professional
          authentication and grading — sealed COA, BX Registry number, and the
          confidence to buy or sell.
        </p>
        <div className="flex flex-wrap gap-3 justify-center pt-1">
          <Link href="/database" className="bx-btn">
            Open the Beanie Database
          </Link>
          <Link href="/authenticate" className="bx-btn bx-btn--ghost">
            Authenticate a Beanie
          </Link>
        </div>
      </section>

      <p className="text-xs text-muted text-center">
        Educational information adapted for Beanie Xchange collectors, informed
        by public price-guide resources including beaniebabiespriceguide.com.
        Not affiliated with Ty Inc. Beanie Babies® and Ty® are trademarks of
        their respective owner.
      </p>
    </article>
  );
}
