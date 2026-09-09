import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { BeanieDatabaseTable } from "@/components/BeanieDatabaseTable";
import { BEANIES } from "@/lib/beanie-database";
import type { CatalogueRow } from "@/lib/beanie-types";
import { searchCatalogue } from "@/lib/beanie-search";
import { CATALOGUE_IMAGES } from "@/lib/beanie-image-map";
import { auth } from "@/lib/auth";
import { isSuperadmin } from "@/lib/guards";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Beanie Baby Database — Names, Years & Values",
  description:
    "Searchable Ty Beanie Baby database. Look up Beanie Babies by name, animal, or category and see introduction years and estimated collector values — bears, the Original 9, dinosaurs, and rare retired Beanies.",
  alternates: { canonical: "/database" },
  keywords: [
    "Beanie Baby database",
    "Beanie Babies list",
    "Beanie Baby values",
    "Beanie Baby price guide",
    "Ty Beanie Babies",
    "rare Beanie Babies",
    "Original 9 Beanie Babies",
  ],
};

export default async function DatabasePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  // Deep-linkable search + sort (the homepage hero's search bar and
  // "Chronological Order" button land here with ?q= / ?sort=year). The first
  // page of rows is filtered and merged (superadmin overrides, photos, recent
  // eBay sold medians) on the server via searchCatalogue, so the ~2,700-entry
  // catalogue never ships to the client — the table fetches further pages and
  // filter changes from /api/beanies.
  const { q, sort } = await searchParams;
  const initialSort = sort === "year" ? "year" : "name";

  let initialRows: CatalogueRow[] = [];
  let initialTotal = 0;
  try {
    const res = await searchCatalogue({ q, sort: initialSort, offset: 0, limit: 100 });
    initialRows = res.rows;
    initialTotal = res.total;
  } catch {
    // DB hiccup → render an empty table; filters retry against the API.
  }

  // The catalogue editor (fields + photo, incl. AI generation) is superadmin-only.
  const session = await auth();
  const canGenerate = isSuperadmin(session?.user);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <header className="space-y-3 text-center">
        <Image
          src="/beaniedatabasehero.webp"
          alt="A collection of Ty Beanie Babies in the Beanie Xchange database."
          width={1536}
          height={1024}
          priority
          sizes="(max-width:1024px) 100vw, 64rem"
          className="w-full h-auto rounded-xl"
        />
        <p className="bx-badge mx-auto">Beanie Database</p>
        <h1 className="text-4xl sm:text-5xl">
          The Beanie Baby <span className="text-[var(--bx-red)]">Database</span>
        </h1>
        <p className="text-muted max-w-2xl mx-auto">
          Search {BEANIES.length.toLocaleString()} Ty Beanie Babies by name,
          animal, or category — the curated original-era (1993–1999) catalogue
          plus the complete expanded Ty roster of later releases. Estimated
          values (original-era entries) are for an authentic example in
          excellent condition with a clean swing tag — actual sale prices vary
          by tag generation, condition, and variation.
        </p>
      </header>

      <BeanieDatabaseTable
        initialRows={initialRows}
        initialTotal={initialTotal}
        initialQuery={q ?? ""}
        initialSort={initialSort}
        canGenerate={canGenerate}
        canEdit={canGenerate}
      />

      <section className="bx-panel bx-panel--accent p-6 text-center space-y-2">
        <h2 className="text-xl font-bold">Have one of these to sell?</h2>
        <p className="text-muted text-sm max-w-xl mx-auto">
          Authenticate it and list it on Beanie Xchange — every sale is
          escrow-protected and every item carries a sealed COA and a permanent
          BX Registry number.
        </p>
        <div className="flex flex-wrap gap-3 justify-center pt-1">
          <Link href="/authenticate" className="bx-btn">
            Authenticate a Beanie
          </Link>
          <Link href="/browse" className="bx-btn bx-btn--ghost">
            Browse the Marketplace
          </Link>
        </div>
      </section>

      <p className="text-xs text-muted text-center">
        Values marked <span className="text-[var(--bx-red)]">eBay median</span>{" "}
        are live medians of recent completed eBay sales — see full{" "}
        <Link
          href="/price-trends"
          className="!text-[var(--bx-red)] font-semibold"
        >
          price trends
        </Link>
        . Other reference values are informed by public price-guide information
        and collector consensus. Not affiliated with Ty Inc. or eBay. Beanie
        Babies® and Ty® are trademarks of their respective owner.
        {Object.keys(CATALOGUE_IMAGES).length > 0 && (
          <>
            {" "}
            Some catalogue photos come from openly licensed sources —{" "}
            <Link
              href="/database/credits"
              className="!text-[var(--bx-red)] font-semibold"
            >
              image credits
            </Link>
            .
          </>
        )}
      </p>
    </div>
  );
}
