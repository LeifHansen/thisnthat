// Client for the eBay "average selling price" API (RapidAPI) documented at
// github.com/colindaniels/eBay-sold-items-documentation. It returns RECENT
// completed/sold eBay listings for a search (eBay only exposes ~90 days), plus
// summary stats. We use it to ground price data in real sales instead of static
// estimates. Configure with RAPIDAPI_KEY (and optionally RAPIDAPI_EBAY_HOST).

// Either name works, matching the existing listing-assist integration.
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || process.env.RAPID_API_KEY || "";
const HOST =
  process.env.RAPIDAPI_EBAY_HOST || "ebay-average-selling-price.p.rapidapi.com";

export function isEbaySoldConfigured(): boolean {
  return Boolean(RAPIDAPI_KEY);
}

export type SoldProduct = {
  title: string;
  saleCents: number;
  shippingCents: number;
  currency: string;
  condition: string | null;
  buyingFormat: string | null;
  /** Parsed from the API's human date ("Jun 11, 2022"); null if unparseable. */
  soldAt: Date | null;
  imageUrl: string | null;
  link: string | null;
  itemId: string;
};

export type CompletedItemsResult = {
  success: boolean;
  averageCents: number | null;
  medianCents: number | null;
  minCents: number | null;
  maxCents: number | null;
  results: number;
  totalResults: number;
  responseUrl: string | null;
  products: SoldProduct[];
};

export type CompletedItemsParams = {
  keywords: string;
  excludedKeywords?: string;
  /** API allows 60, 120, or 240. */
  maxResults?: 60 | 120 | 240;
  categoryId?: string;
  removeOutliers?: boolean;
  siteId?: string;
  aspects?: { name: string; value: string }[];
};

function toCents(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) : 0;
}

function centsOrNull(n: unknown): number | null {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) : null;
}

/** Parse the API's human date ("Jun 11, 2022") to a Date, or null. */
export function parseSoldDate(s: unknown): Date | null {
  if (typeof s !== "string" || !s.trim()) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  // These dates carry no timezone, so Date.parse reads them in the server's
  // local zone. Re-anchor to UTC midnight of that calendar date so monthly
  // bucketing (which uses getUTC*) is timezone-independent.
  const d = new Date(t);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/**
 * Fetch completed (sold) eBay items for a search. Throws on configuration or
 * transport errors so callers can report them; returns a normalized result on
 * success (prices converted to integer cents, dates parsed).
 */
export async function fetchCompletedItems(
  params: CompletedItemsParams,
): Promise<CompletedItemsResult> {
  if (!isEbaySoldConfigured()) {
    throw new Error("eBay sold-price API is not configured (RAPIDAPI_KEY missing).");
  }

  const body = {
    keywords: params.keywords,
    excluded_keywords: params.excludedKeywords ?? "",
    max_search_results: params.maxResults ?? 240,
    category_id: params.categoryId,
    remove_outliers: params.removeOutliers ?? true,
    site_id: params.siteId ?? "0",
    aspects: params.aspects ?? [],
  };

  const res = await fetch(`https://${HOST}/findCompletedItems`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-rapidapi-host": HOST,
      "x-rapidapi-key": RAPIDAPI_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `eBay sold-price API returned ${res.status}${
        detail ? `: ${detail.slice(0, 200)}` : ""
      }`,
    );
  }

  const data: unknown = await res.json().catch(() => null);
  const d = (data ?? {}) as Record<string, unknown>;
  const rawProducts = Array.isArray(d.products) ? d.products : [];

  const products: SoldProduct[] = rawProducts
    .map((p): SoldProduct | null => {
      const o = (p ?? {}) as Record<string, unknown>;
      const itemId = typeof o.item_id === "string" ? o.item_id : String(o.item_id ?? "");
      if (!itemId) return null;
      return {
        title: typeof o.title === "string" ? o.title : "",
        saleCents: toCents(o.sale_price),
        shippingCents: toCents(o.shipping_price),
        currency: typeof o.currency === "string" ? o.currency : "$",
        condition: typeof o.condition === "string" ? o.condition : null,
        buyingFormat: typeof o.buying_format === "string" ? o.buying_format : null,
        soldAt: parseSoldDate(o.date_sold),
        imageUrl: typeof o.image_url === "string" ? o.image_url : null,
        link: typeof o.link === "string" ? o.link : null,
        itemId,
      };
    })
    .filter((p): p is SoldProduct => p != null && p.saleCents > 0);

  return {
    success: d.success === true,
    averageCents: centsOrNull(d.average_price),
    medianCents: centsOrNull(d.median_price),
    minCents: centsOrNull(d.min_price),
    maxCents: centsOrNull(d.max_price),
    results: typeof d.results === "number" ? d.results : products.length,
    totalResults: typeof d.total_results === "number" ? d.total_results : products.length,
    responseUrl: typeof d.response_url === "string" ? d.response_url : null,
    products,
  };
}
