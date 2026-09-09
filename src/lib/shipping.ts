// EasyPost integration (REST, no SDK dependency). Rates seller -> buyer
// shipping at checkout, buys labels for a sale, and registers trackers so
// carrier scans reach our webhook. All calls are best-effort — when
// EASYPOST_API_KEY is absent or a call fails, we fall back to a flat rate /
// manual tracking entry so a sale never hard-fails on shipping.

const EASYPOST_API = "https://api.easypost.com/v2";
const key = process.env.EASYPOST_API_KEY;

/** Whether live rating and label purchase are possible at all. */
export function isEasyPostConfigured(): boolean {
  return Boolean(key);
}

export type ShipAddress = {
  name: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
};

// Flat fallback when EasyPost isn't configured or a live rate fails:
// ~$8 base + $1.50 per additional item in the parcel.
const FLAT_BASE_CENTS = 800;
const FLAT_PER_EXTRA_CENTS = 150;
function flatCents(itemCount: number): number {
  const n = Math.max(1, itemCount);
  return FLAT_BASE_CENTS + (n - 1) * FLAT_PER_EXTRA_CENTS;
}

// Parcel estimate for EasyPost. Sellers don't enter dimensions in V1, so the
// rate is for a small boxed parcel that grows with the item count; it is the
// buyer's shipping charge, not the label the seller eventually buys.
function parcelForCount(itemCount: number) {
  const n = Math.max(1, itemCount);
  return {
    weight: 8 + n * 12, // ounces
    length: 12,
    width: 9,
    height: Math.min(3 + n * 2, 18),
  };
}

// The key is fixed for the process lifetime — encode it once, not per request.
const AUTH_HEADER = `Basic ${Buffer.from(`${key}:`).toString("base64")}`;

async function epPost(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${EASYPOST_API}${path}`, {
    method: "POST",
    headers: { Authorization: AUTH_HEADER, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`EasyPost ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return res.json();
}

function addrPayload(a: ShipAddress) {
  return {
    name: a.name,
    street1: a.line1,
    street2: a.line2 || undefined,
    city: a.city,
    state: a.state,
    zip: a.postalCode,
    country: a.country ?? "US",
  };
}

type Rate = { id: string; rate: string; carrier?: string; service?: string };

function cheapest(rates: Rate[]): Rate | null {
  let best: Rate | null = null;
  let bestVal = Infinity;
  for (const r of rates) {
    // Skip malformed rates; otherwise a non-numeric first entry would stick as
    // "best" (every `x < NaN` is false) and yield NaN cents downstream.
    const val = parseFloat(r.rate);
    if (!Number.isFinite(val)) continue;
    if (val < bestVal) {
      best = r;
      bestVal = val;
    }
  }
  return best;
}

export type ShipRate = {
  cents: number;
  /** true when from a live EasyPost rate, false when the flat fallback ran. */
  rated: boolean;
};

/**
 * Live rate for a sale: seller's ship-from ZIP -> buyer address, cheapest
 * carrier rate. EasyPost rates fine from a ZIP-only origin (carrier pricing
 * is zone-based). Flat fallback when the seller has no ZIP on file, the key
 * is missing, or the call fails — a sale must never block on rating.
 */
export async function rateSaleShipping(
  sellerZip: string | null | undefined,
  buyer: ShipAddress,
  itemCount = 1,
): Promise<ShipRate> {
  const flat = (): ShipRate => ({ cents: flatCents(itemCount), rated: false });
  const zip = (sellerZip ?? "").trim();
  if (!key || !zip) return flat();
  try {
    const shipment = await epPost("/shipments", {
      shipment: {
        to_address: addrPayload(buyer),
        from_address: { zip, country: "US" },
        parcel: parcelForCount(itemCount),
      },
    });
    const best = cheapest((shipment.rates as Rate[]) ?? []);
    if (!best) return flat();
    const cents = Math.round(parseFloat(best.rate) * 100);
    if (!Number.isFinite(cents)) return flat();
    return { cents, rated: true };
  } catch {
    return flat();
  }
}

export type BoughtLabel = {
  carrier: string;
  tracking: string;
  labelUrl: string;
};

/**
 * Create a shipment and buy its cheapest label: seller -> buyer. Best-effort:
 * returns null when EasyPost is unconfigured or any step fails, so callers can
 * fall back to manual carrier/tracking entry.
 */
export async function buySaleLabel(
  from: ShipAddress,
  to: ShipAddress,
  itemCount = 1,
): Promise<BoughtLabel | null> {
  if (!key) return null;
  try {
    const shipment = await epPost("/shipments", {
      shipment: {
        to_address: addrPayload(to),
        from_address: addrPayload(from),
        parcel: parcelForCount(itemCount),
      },
    });
    const best = cheapest((shipment.rates as Rate[]) ?? []);
    if (!best) return null;
    const bought = await epPost(`/shipments/${shipment.id as string}/buy`, {
      rate: { id: best.id },
    });
    const selected = bought.selected_rate as { carrier?: string } | undefined;
    const label = bought.postage_label as { label_url?: string } | undefined;
    return {
      carrier: selected?.carrier ?? best.carrier ?? "",
      tracking: (bought.tracking_code as string) ?? "",
      labelUrl: label?.label_url ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * Register a tracking number with EasyPost so its carrier scans arrive at our
 * webhook. Labels we buy through the API get a tracker automatically, but a
 * seller who types their own tracking number needs this — without it no
 * `tracker.updated` event ever fires for the sale, and delivery-triggered
 * payout could never happen.
 *
 * Best-effort: returns the tracker id, or null when EasyPost is unconfigured
 * or the code is unrecognized. Callers must not block shipping on it — the
 * buyer's confirm-receipt button remains the fallback release path.
 */
export async function createTracker(
  trackingCode: string,
  carrier?: string | null,
): Promise<string | null> {
  if (!key || !trackingCode.trim()) return null;
  try {
    const tracker = await epPost("/trackers", {
      tracker: {
        tracking_code: trackingCode.trim(),
        ...(carrier?.trim() ? { carrier: carrier.trim() } : {}),
      },
    });
    return (tracker.id as string) ?? null;
  } catch {
    return null;
  }
}
