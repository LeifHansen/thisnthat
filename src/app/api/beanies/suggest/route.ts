import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { rankCatalogueMatches, resolveBeanie } from "@/lib/beanie-id";

// Typeahead over the Beanie catalogue for the BeanieCombobox. Ranking +
// resolution run on the server so the ~2,700-entry catalogue never ships to the
// browser. Returns the closest ranked matches and, if the text confidently
// resolves to one entry, that `linked` entry.
export async function GET(req: Request) {
  const limited = rateLimit(req, "beanie-suggest", 120, 60_000);
  if (limited) return limited;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 160);
  const limit = Math.min(
    60,
    Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "", 10) || 40),
  );

  const matches = rankCatalogueMatches(q, limit);
  const linked = resolveBeanie(q);
  return NextResponse.json({ matches, linked });
}
