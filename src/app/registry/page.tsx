import type { Metadata } from "next";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "BX Registry — Verify a Beanie Baby Authentication",
  description:
    "Verify a Beanie Baby authentication on the Beanie Xchange Registry. Look up BX Registry numbers, BX Certificate of Authenticity IDs, or True Blue Beans cert IDs. Every authenticated Beanie Baby — in-house or via True Blue — is permanently registered.",
  alternates: { canonical: "/registry" },
  keywords: [
    "Beanie Baby authentication lookup",
    "BX Registry",
    "True Blue cert lookup",
    "Beanie Baby COA verify",
    "authenticate Beanie Babies",
  ],
  openGraph: {
    title: "BX Registry — Verify a Beanie Baby Authentication",
    description:
      "Look up any authenticated Beanie Baby by registry number or cert ID.",
    url: "/registry",
  },
};

const ISSUER_BADGE: Record<
  "BX_AUTHENTICATION" | "TRUE_BLUE",
  { label: string; color: string }
> = {
  BX_AUTHENTICATION: { label: "BX Authentication", color: "var(--bx-red)" },
  TRUE_BLUE: { label: "True Blue Beans", color: "#3b8ed0" },
};

export default async function RegistryPage({
  searchParams,
}: {
  searchParams: Promise<{ n?: string }>;
}) {
  const sp = await searchParams;
  const number = (sp.n ?? "").trim().toUpperCase();

  // A lookup can match any of the IDs we store:
  //   - BX registration number (BXR-XXXXXX)
  //   - BX cert ID            (BX-YYYY-XXXXXXXX)
  //   - externalCertId        (e.g. True Blue TBB-...)
  // Search all three so the user only has to type one thing.
  const entry = number
    ? await prisma.registryEntry.findFirst({
        where: {
          OR: [
            { registrationNumber: number },
            { bxCertId: number },
            { externalCertId: number },
          ],
        },
      })
    : null;

  const [total, bxCount, tbCount] = await Promise.all([
    prisma.registryEntry.count().catch(() => 0),
    prisma.registryEntry
      .count({ where: { issuer: "BX_AUTHENTICATION" } })
      .catch(() => 0),
    prisma.registryEntry
      .count({ where: { issuer: "TRUE_BLUE" } })
      .catch(() => 0),
  ]);

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <span className="bx-badge text-yellow mx-auto">BX Registry</span>
        <h1 className="text-3xl !text-ink">Verify a Beanie Baby authentication</h1>
        <p className="text-muted text-sm">
          {total} authenticated Beanie Bab{total === 1 ? "y" : "ies"} registered
          {total > 0 && (
            <>
              {" "}
              · <span className="text-[var(--bx-red)]">{bxCount}</span> BX
              Authentication ·{" "}
              <span className="text-cyan">{tbCount}</span> True Blue
            </>
          )}
        </p>
        <p className="text-muted text-xs">
          Search by registration number (BXR-…), BX cert ID (BX-…), or True
          Blue cert ID (TBB-…).
        </p>
      </div>

      <form method="GET" className="bx-panel p-5 flex flex-col sm:flex-row gap-3">
        <input
          name="n"
          defaultValue={number}
          placeholder="e.g. BXR-7F3K9Q · BX-2026-… · TBB-…"
          className="bx-input"
        />
        <button className="bx-btn" type="submit">
          Verify
        </button>
      </form>

      {number && (
        <div className="bx-panel p-6 space-y-2">
          {entry ? (
            <>
              <p
                className="bx-badge"
                style={{
                  color: ISSUER_BADGE[entry.issuer].color,
                  borderColor: ISSUER_BADGE[entry.issuer].color,
                }}
              >
                ✓ Authentic — {ISSUER_BADGE[entry.issuer].label}
              </p>
              <p className="text-ink text-lg pt-2">{entry.itemName}</p>
              <p className="text-cyan">
                Grade: {entry.grade ?? "Authenticated (not graded)"}
              </p>
              <p className="text-muted text-sm">
                Registration #: {entry.registrationNumber}
              </p>
              <p className="text-muted text-sm">
                BX Certificate: {entry.bxCertId}
              </p>
              {entry.externalCertId && (
                <p className="text-muted text-sm">
                  True Blue cert: {entry.externalCertId}
                </p>
              )}
              <p className="text-muted text-sm">
                Issued: {entry.issuedAt.toISOString().slice(0, 10)}
              </p>
            </>
          ) : (
            <p className="text-pink">
              No registry entry found for{" "}
              <span className="text-ink">{number}</span>. Double-check the
              number — we recognize BX Registry, BX Cert, and True Blue Cert
              formats.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
