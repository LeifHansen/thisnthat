import type { Metadata } from "next";
import Link from "next/link";
import { CATALOGUE_IMAGES } from "@/lib/beanie-image-map";
import { BEANIES } from "@/lib/beanie-database";
import { beaniePhotoKey } from "@/lib/photos";

export const metadata: Metadata = {
  title: "Database image credits",
  robots: { index: false, follow: false },
};

/**
 * Attribution for catalogue images sourced from openly licensed material
 * (CC licenses require credit). Populated by scripts/import-beanie-images.ts.
 */
export default function DatabaseCreditsPage() {
  const nameByKey = new Map(BEANIES.map((b) => [beaniePhotoKey(b.name), b.name]));
  const rows = Object.entries(CATALOGUE_IMAGES).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl">Database image credits</h1>
        <p className="text-muted text-sm">
          Catalogue thumbnails on the{" "}
          <Link href="/database" className="!text-[var(--bx-red)] font-semibold">
            Beanie Database
          </Link>{" "}
          come first from photos sellers upload to BX listings. Where noted
          below, an entry instead uses an openly licensed photo; each is
          credited to its author with its license and original source.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="bx-panel p-8 text-center text-muted">
          No externally sourced images yet — all current thumbnails are BX
          seller photos.
        </p>
      ) : (
        <ul className="bx-panel divide-y divide-[var(--bx-line)]">
          {rows.map(([key, img]) => (
            <li key={key} className="p-4 text-sm">
              <span className="font-bold">{nameByKey.get(key) ?? key}</span>
              {" — "}
              <span className="text-muted">
                {img.credit}, {img.license},{" "}
                <a
                  href={img.sourceUrl}
                  rel="noopener noreferrer nofollow"
                  target="_blank"
                  className="!text-[var(--bx-red)]"
                >
                  source
                </a>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
