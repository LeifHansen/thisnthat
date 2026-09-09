import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Ty Error Tags, Birth Dates & Values — Beanie Baby Myths Debunked",
  description:
    "The truth about Ty Beanie Baby 'error' tags, birth dates, and values. The 'ii' and 'surface' 5th-generation swing-tag errors are extremely common — not rare and not valuable. Learn why tush-tag dates differ from birthdays, how tag generations work, and why inflated eBay asking prices are a myth.",
  alternates: { canonical: "/beanie-info/error-tags" },
  keywords: [
    "Ty error tags",
    "Beanie Baby error tags",
    "Beanie Baby birth dates",
    "5th generation swing tag errors",
    "ii error tag",
    "surface error tag",
    "Beanie Baby tag generations",
    "rare Beanie Babies myth",
    "Beanie Baby values",
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

export default function ErrorTagsPage() {
  return (
    <article className="max-w-3xl mx-auto space-y-10">
      <header className="space-y-3 text-center">
        <p className="bx-badge mx-auto">Beanie Info</p>
        <h1 className="text-4xl sm:text-5xl">
          Ty <span className="text-[var(--bx-red)]">Error Tags</span>, Birth
          Dates &amp; Values
        </h1>
        <p className="text-muted max-w-2xl mx-auto">
          Long-time collectors are stunned by the asking prices on certain
          Beanie Babies. Here&apos;s the honest reality: the &ldquo;error
          tag&rdquo; beanies everyone&apos;s chasing aren&apos;t rare,
          aren&apos;t worth authenticating, and aren&apos;t worth much at all —
          millions were made. This is what actually matters, and what&apos;s
          pure myth.
        </p>
      </header>

      <Section title="The famous &ldquo;error&rdquo; tags (and why they&apos;re common)">
        <p>
          The most-hyped &ldquo;errors&rdquo; are the <strong>&ldquo;ii&rdquo;</strong>{" "}
          and <strong>&ldquo;surface&rdquo;</strong> mistakes printed on{" "}
          <strong>early 5th-generation swing tags</strong>. Yes — they are
          genuine printing errors. But they were printed on{" "}
          <strong>millions</strong> of tags, which means they are{" "}
          <strong>not rare and not valuable</strong>.
        </p>
        <p>
          You&apos;ll find these same errors on Peace bears, Blackie, Roary,
          Curly, Ears, Goldie, Hoppity, Cubbie, Chocolate, and countless others.
          Essentially <em>any</em> early 5th-gen swing tag can carry this error.
          It is not worth paying a premium for, and it is not worth the cost of
          authentication.
        </p>
      </Section>

      <Section title="Myth: &ldquo;The birth date doesn&apos;t match the tush-tag date&rdquo;">
        <p>
          The date on the tush tag is the <strong>copyright date</strong>, not
          the Beanie&apos;s birthday — so the two routinely differ. Ty
          frequently copyrighted a Beanie&apos;s name well before releasing it,
          so a copyright/tush date that&apos;s earlier or different than the
          printed birthday is completely normal. It does <strong>not</strong>{" "}
          make a Beanie rare.
        </p>
      </Section>

      <Section title="Myth: &ldquo;The birthday is written differently, so it&apos;s rare&rdquo;">
        <p>
          A birthday written as <em>&ldquo;July 1, 1996&rdquo;</em> versus{" "}
          <em>&ldquo;7-1-96&rdquo;</em> is simply a tag-generation difference,
          not a rarity:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Spelled out</strong> (&ldquo;July 1, 1996&rdquo;) → a{" "}
            <strong>5th-generation</strong> swing tag.
          </li>
          <li>
            <strong>Numeric</strong> (&ldquo;7-1-96&rdquo;) → a{" "}
            <strong>4th-generation</strong> swing tag.
          </li>
        </ul>
        <p>
          Both are normal production variations. Neither commands a meaningful
          premium on its own.
        </p>
      </Section>

      <Section title="The one tag variation collectors do pay a little extra for">
        <p>
          There are six versions of the 4th-generation swing tag.{" "}
          <strong>Version 6</strong> prints the Beanie&apos;s name in{" "}
          <strong>ALL CAPS</strong>. A few of these are genuinely harder to
          find, and some collectors pay a <em>small</em> premium for them. They
          look like ordinary 4th-gen tags — the only difference is the
          all-caps name. Even here, keep expectations modest.
        </p>
      </Section>

      <Section title="So why are the asking prices so high?">
        <p>
          The key word is <strong>asking</strong>. Anyone can list a common
          Beanie for $10,000 — that doesn&apos;t mean it sells for $10,000.
          Most of the original, knowledgeable sellers left the hobby years ago.
          As they exited, some ambitious newcomers began marketing
          &ldquo;error&rdquo; tags as rare, invented stories to justify the
          prices, and even staged <strong>fake sales</strong> — listing an item
          and having someone &ldquo;buy&rdquo; it (the sale never actually
          completed) to trick newer buyers into thinking those prices were
          real. Clickbait articles then repeated the myth.
        </p>
        <p>
          <strong>Price from completed/SOLD listings, never asking prices</strong>{" "}
          — and learn to spot the staged sales and fakes mixed in.
        </p>
      </Section>

      <section className="bx-panel bx-panel--accent p-6 text-center space-y-3">
        <h2 className="text-xl font-bold">Bottom line</h2>
        <p className="text-muted text-sm max-w-xl mx-auto">
          &ldquo;Error tag&rdquo; and odd-birthday Beanies are almost always
          common. Before you pay a premium — or list one — check what real
          examples actually sell for, and look it up in our database.
        </p>
        <div className="flex flex-wrap gap-3 justify-center pt-1">
          <Link href="/database" className="bx-btn">
            Open the Beanie Database
          </Link>
          <Link href="/beanie-info" className="bx-btn bx-btn--ghost">
            More Beanie Info
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
