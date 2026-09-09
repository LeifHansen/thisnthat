import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { firstRealPhoto, realPhotoWhere } from "@/lib/photos";
import { beanieImageAlt } from "@/lib/image-seo";
import { BeanieIllustration } from "@/components/BeanieIllustration";
import {
  HeartTagIcon,
  CoinIcon,
  PeaceIcon,
  BasketIcon,
} from "@/components/BrandIcons";

export const metadata: Metadata = {
  title: "Beanie Baby Rarity Guide — How to Value Your Beanies",
  description:
    "What makes a Beanie Baby valuable in 2026: tag generations, condition, retirement status, pellet types, and notable high-value pieces. A practical guide for buyers and sellers on BeanieExchange.com.",
  alternates: { canonical: "/rarity-guide" },
};

// The notable-Beanies grid shows real photos. By default each card uses the
// cheapest active listing's photo for that beanie; these explicit overrides win
// where we want a specific reference shot (e.g. no listing exists yet). The
// hand-drawn BeanieIllustration is the final fallback when neither is available.
const NOTABLE_PHOTO_OVERRIDES: Record<string, string> = {
  Peanut:
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQr3BTJIT6sOsRL5qYwH-YmzW9ptHP1T9-4KLEIUiEgvw&s=10",
};

const RARITY_TIERS: {
  tier: string;
  range: string;
  examples: string;
  color: string;
}[] = [
  {
    tier: "Common",
    range: "$5 – $20",
    examples: "Mass-produced, common colourways, late-generation tags.",
    color: "var(--bx-muted)",
  },
  {
    tier: "Uncommon",
    range: "$20 – $100",
    examples: "Early retirements, mid-generation tags, mint condition.",
    color: "#46a85a",
  },
  {
    tier: "Rare",
    range: "$100 – $1,000+",
    examples: "Low production, 1st–3rd gen tags, regional exclusives.",
    color: "#3b8ed0",
  },
  {
    tier: "Ultra-Rare",
    range: "$1,000 – tens of thousands",
    examples: "Colour variants, prototypes, recall errors, celebrity ties.",
    color: "#8a4fb0",
  },
];

const NOTABLE: { name: string; note: string }[] = [
  {
    name: "Princess",
    note: "1997 Diana commemorative; PE-pellet variants in mint condition routinely clear $500+.",
  },
  {
    name: "Peanut",
    note: "The royal-blue colourway (1995) is one of the most-cited rare Beanies.",
  },
  {
    name: "Peace",
    note: "Tie-dye Peace Bear — a celebrated 1996 release, condition-sensitive.",
  },
  {
    name: "Valentino",
    note: "White bear with red heart; clean tag generation 1–3 examples are sought.",
  },
  {
    name: "Pinchers",
    note: "Original 9 (1993). 1st-gen tag + mint plush is a foundational collector piece.",
  },
  {
    name: "Patti",
    note: "Original 9 platypus. Early-magenta and deep-fuchsia variants vary widely in value.",
  },
  {
    name: "Spot",
    note: "Original 9 dog. The 'no spot' early version is the variant collectors hunt.",
  },
  {
    name: "Legs",
    note: "Original 9 frog. Easy to find — high condition + early tag is what matters.",
  },
];

export const dynamic = "force-dynamic";

/**
 * Map each notable beanie to a real photo: an explicit override if we have one,
 * otherwise the cheapest active listing's first genuine photo. Names with
 * neither return undefined and fall back to the hand-drawn illustration.
 */
async function getNotablePhotos(
  names: string[],
): Promise<Record<string, string | undefined>> {
  const photos: Record<string, string | undefined> = {};
  let rows: { beanieName: string; photos: string[] }[] = [];
  try {
    rows = await prisma.listing.findMany({
      where: { status: "ACTIVE", beanieName: { in: names }, ...realPhotoWhere },
      orderBy: { priceCents: "asc" },
      select: { beanieName: true, photos: true },
    });
  } catch {
    // DB unavailable (e.g. at build) — fall through to overrides / illustration.
    rows = [];
  }

  for (const name of names) {
    if (NOTABLE_PHOTO_OVERRIDES[name]) {
      photos[name] = NOTABLE_PHOTO_OVERRIDES[name];
      continue;
    }
    // Rows are price-ascending, so the first match is the cheapest listing.
    const match = rows.find((r) => r.beanieName === name);
    photos[name] = match ? firstRealPhoto(match.photos) ?? undefined : undefined;
  }
  return photos;
}

export default async function RarityGuidePage() {
  const notablePhotos = await getNotablePhotos(NOTABLE.map((n) => n.name));

  return (
    <article className="max-w-3xl mx-auto space-y-12">
      <header className="text-center space-y-3">
        <Image
          src="/brand/bx-heart-logo-v3.png"
          alt="Beanie Xchange"
          width={512}
          height={512}
          priority
          className="h-20 w-20 mx-auto object-contain"
        />
        <p className="bx-badge mx-auto">Rarity Guide</p>
        <h1 className="text-4xl sm:text-5xl">
          What makes a Beanie Baby{" "}
          <span className="text-[var(--bx-red)]">valuable</span>?
        </h1>
        <p className="text-muted max-w-2xl mx-auto">
          A practical, up-to-date guide for buyers and sellers on
          BeanieExchange.com — what to inspect, what categories of value
          actually exist in today&apos;s market, and which Beanies are worth
          the time to authenticate.
        </p>
      </header>

      {/* Key factors */}
      <section className="space-y-5">
        <h2 className="text-2xl sm:text-3xl text-center">
          Key factors that determine rarity & value
        </h2>

        <Factor
          n={1}
          title="Tag generations (most important)"
          body={[
            "1st – 3rd generation hang tags (1993 to early 1996) are the rarest and most valuable. Early tags have specific fonts, colours, and formats that mass-produced later versions don't share.",
            "4th-generation and later tags were mass-produced — value drops sharply.",
            "Both the hang tag (heart-shaped paper tag) and the tush tag (sewn-in fabric tag) should match generation-for-generation and be in good condition. A mismatched pair is one of the most common counterfeit markers.",
          ]}
        />
        <Factor
          n={2}
          title="Condition (critical)"
          body={[
            "Mint with tags (MWT) is the gold standard: never played with, tags intact and uncreased, no odours or stains, no fabric pilling.",
            "Missing or damaged tags can cut value by 50 % or more — even on a rare Beanie.",
            "Clean, smoke-free storage, no sun fade, and original pellet condition all matter.",
          ]}
        />
        <Factor
          n={3}
          title="Retirement status & production numbers"
          body={[
            "Early retired Beanies — especially the Original 9 of 1993 — are generally the most desirable mainstream pieces.",
            "Limited editions, store exclusives (FAO Schwarz, Disney), and low-production runs carry a premium.",
            "Regional exclusives (Maple in Canada, Britannia in the UK, Erin in Ireland) command higher prices than their US counterparts.",
          ]}
        />
        <Factor
          n={4}
          title="Tag errors"
          body={[
            "Minor spelling and printing mistakes do exist, but most do not dramatically increase value anymore — many were mass-produced with the same 'error.'",
            "True rare errors on early-generation tags can add a real premium; later-gen 'errors' are usually noise.",
          ]}
        />
        <Factor
          n={5}
          title="Pellets / stuffing"
          body={[
            "Early PVC pellets vs later PE pellets matters to serious collectors — PVC is generally preferred for older pieces because it indicates an early production run.",
            "Fill consistency, weight, and the feel of the plush also factor in for grading.",
          ]}
        />
      </section>

      {/* Rarity tier table */}
      <section className="space-y-4">
        <h2 className="text-2xl sm:text-3xl text-center">Rarity categories</h2>
        <div className="bx-panel overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-[var(--bx-surface)] text-left">
              <tr>
                <th className="p-3 font-semibold">Tier</th>
                <th className="p-3 font-semibold">Price range</th>
                <th className="p-3 font-semibold">What it usually means</th>
              </tr>
            </thead>
            <tbody>
              {RARITY_TIERS.map(({ tier, range, examples, color }) => (
                <tr
                  key={tier}
                  className="border-t border-[var(--bx-line)] align-top"
                >
                  <td className="p-3">
                    <span
                      className="inline-block px-2.5 py-1 rounded-md text-xs font-bold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {tier}
                    </span>
                  </td>
                  <td className="p-3 font-semibold">{range}</td>
                  <td className="p-3 text-muted">{examples}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        <p className="text-xs text-muted text-center">
          Real top sales for pristine early pieces are strong but more modest
          than headline &ldquo;million-dollar Beanie&rdquo; clickbait would
          have you believe.
        </p>
      </section>

      {/* Most valuable */}
      <section className="space-y-5">
        <h2 className="text-2xl sm:text-3xl text-center">
          Most-valuable / notable Beanies in 2025–2026
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {NOTABLE.map(({ name, note }) => {
            const photo = notablePhotos[name];
            return (
              <div
                key={name}
                className="bx-panel p-3 flex gap-3 items-center !text-ink"
              >
                <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-[var(--bx-line)] bg-[var(--bx-surface)]">
                  {photo ? (
                    // Listing/reference photos are arbitrary remote URLs; next/image
                    // would need every host whitelisted in next.config.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo}
                      alt={beanieImageAlt(name)}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <BeanieIllustration name={name} className="w-full h-full" />
                  )}
                </div>
                <div>
                  <p className="font-display text-base">{name}</p>
                  <p className="text-xs text-muted">{note}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Quick ID tips */}
      <section className="bx-panel bx-panel--accent p-6 space-y-3">
        <h2 className="text-2xl flex items-center gap-3">
          <PeaceIcon className="h-8 w-8" />
          Quick visual identification tips
        </h2>
        <ul className="text-sm space-y-2 list-disc list-inside text-muted">
          <li>
            Check the heart tag font, colour, and Ty logo style against known
            generation references.
          </li>
          <li>
            Examine stitching quality, eye placement, and fabric texture for
            anomalies that suggest a counterfeit.
          </li>
          <li>
            Compare tush-tag details — copyright dates, country of origin,
            pellet type — to the hang-tag generation.
          </li>
          <li>
            Photograph high-value pieces from multiple angles, including
            close-ups of both tags and any unique markings, before listing.
          </li>
        </ul>
      </section>

      {/* Authentication + selling tips */}
      <section className="grid sm:grid-cols-2 gap-4">
        <div className="bx-panel p-5 space-y-2">
          <HeartTagIcon className="h-10 w-10" />
          <h3 className="font-display text-lg">
            When to authenticate
          </h3>
          <ul className="text-sm text-muted space-y-1 list-disc list-inside">
            <li>Any Beanie you suspect is 1st–3rd generation</li>
            <li>Any regional exclusive (Maple, Britannia, Erin, Glory)</li>
            <li>Princess, Peace, Peanut, Valentino, Libearty</li>
            <li>Anything with a colour variant or recall history</li>
            <li>Anything you intend to list above $100</li>
          </ul>
          <Link
            href="/authenticate"
            className="!text-[var(--bx-red)] font-semibold text-sm"
          >
            Submit a Beanie for authentication →
          </Link>
        </div>
        <div className="bx-panel p-5 space-y-2">
          <CoinIcon className="h-10 w-10" />
          <h3 className="font-display text-lg">Tips for sellers</h3>
          <ul className="text-sm text-muted space-y-1 list-disc list-inside">
            <li>Authenticate first if the Beanie could clear $100</li>
            <li>Photograph both tags in focus, close up</li>
            <li>Note the generation in your title (e.g.{" "}
              <span className="font-mono text-xs">3rd gen hang / 4th gen tush</span>)
            </li>
            <li>Disclose any tag bend, fade, or odor — buyers will spot it</li>
            <li>Use Mint / Near-Mint / Excellent / Good consistently</li>
          </ul>
        </div>
      </section>

      {/* How BX uses this */}
      <section className="bx-panel p-6 space-y-3">
        <h2 className="text-xl flex items-center gap-3">
          <BasketIcon className="h-8 w-8" />
          How BeanieExchange uses this guide
        </h2>
        <ul className="text-sm text-muted space-y-1 list-disc list-inside">
          <li>
            <strong className="text-ink">Browse filters</strong> let you
            narrow by authentication tier and listing recency.
          </li>
          <li>
            <strong className="text-ink">Listing pages</strong> surface the
            tag generation, condition rating, and Certificate of
            Authenticity number on every BX-authenticated piece.
          </li>
          <li>
            <strong className="text-ink">Seller wizard</strong> walks you
            through choosing the right authentication path before publishing
            so you get the highest possible resale price.
          </li>
          <li>
            <strong className="text-ink">BX Registry</strong> tracks every
            sealed, COA-attached Beanie — buyers and future owners can
            verify a registration number any time.
          </li>
        </ul>
      </section>

      <section className="text-center space-y-3">
        <h2 className="text-2xl">Ready to list or authenticate?</h2>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/sell" className="bx-btn">
            List a Beanie
          </Link>
          <Link href="/authenticate" className="bx-btn bx-btn--ghost">
            Authenticate a Beanie
          </Link>
          {/* Verify-cert entry point — disabled with in-house (BX) authentication:
          <Link href="/registry" className="bx-btn bx-btn--ghost">
            Verify a registry #
          </Link>
          */}
        </div>
      </section>
    </article>
  );
}

function Factor({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: string[];
}) {
  return (
    <div className="bx-panel p-5 flex gap-4 items-start">
      <div className="bx-step bx-step--active shrink-0">{n}</div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        {body.map((para, i) => (
          <p key={i} className="text-sm text-muted leading-relaxed">
            {para}
          </p>
        ))}
      </div>
    </div>
  );
}
