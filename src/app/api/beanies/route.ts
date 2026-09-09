import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { searchCatalogue } from "@/lib/beanie-search";

// Public paginated search over the Beanie catalogue for the /database table.
// Filtering/merging happens server-side so the catalogue stays off the client.
export async function GET(req: Request) {
  const limited = rateLimit(req, "beanie-search", 120, 60_000);
  if (limited) return limited;

  const url = new URL(req.url);
  const num = (k: string, d: number) =>
    Number.parseInt(url.searchParams.get(k) ?? "", 10) || d;

  try {
    const { rows, total } = await searchCatalogue({
      q: url.searchParams.get("q") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      letter: url.searchParams.get("letter") ?? undefined,
      collection: url.searchParams.get("collection") ?? undefined,
      sort: url.searchParams.get("sort") === "year" ? "year" : "name",
      offset: num("offset", 0),
      limit: num("limit", 100),
    });
    return NextResponse.json({ rows, total });
  } catch {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
