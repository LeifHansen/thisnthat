import type { AuthProvider, AuthServiceLevel, AuthTier } from "@prisma/client";

// All money in integer cents.
const PLATFORM_FEE_PCT = 0.1; // 10% marketplace fee on sales (seller-side only)
/** Display string for the platform fee, e.g. "10%". Keeps UI copy in sync. */
export const PLATFORM_FEE_LABEL = `${Math.round(PLATFORM_FEE_PCT * 100)}%`;
// Flat fallback per shipping leg on direct sales — used when the seller has
// no ship-from ZIP on file or a live EasyPost rate fails. Rated shipping is
// the norm (see rateSaleShipping in src/lib/shipping.ts).
export const SHIPPING_LEG_CENTS = 800;

// --- Authentication pricing ---
// Two options offered to the customer at submission time:
//
//   BX_AUTHENTICATION /    — in-house Beanie Xchange authentication (in-app
//     BASIC                  checkout). $5/beanie — we authenticate the beanie,
//                            attach a numbered "BX Authentic" token to the
//                            beanie itself, and return it heat-sealed with a
//                            Certificate of Authenticity + a permanent BX
//                            Registry number. No protective/display case.
//   TRUE_BLUE              — drop-shipped to True Blue Beans (partnership).
//                            $18 per beanie for the service. Shipping TO them
//                            is covered by the prepaid label; RETURN shipping
//                            is calculated per order, so it is not part of the
//                            quoted figure (which is shown as "$18+").
//   For BX, only the INBOUND shipping leg (submitter -> HQ) is calculated at
//   checkout from the submitter's address (EasyPost, see src/lib/shipping.ts)
//   and added to the service fee; RETURN shipping is included in the price.
//
// FULL_GRADING is retained in the data model/back office but is NOT currently
// offered to customers (we don't do the protective-case grading tier).
//
// NO SALES TAX IS COLLECTED ON ANY FLOW TODAY. The figures below are the whole
// charge. This was previously commented (and shown to submitters) as "computed
// at checkout via Stripe Tax", which was never true: Stripe Tax cannot attach
// to a bare PaymentIntent — `automatic_tax` exists on Checkout Sessions and
// Invoices, not on PaymentIntent.create — and nothing in this codebase ever
// called the Tax API. Collecting it means moving these flows onto Checkout
// Sessions (see the TODO in api/authenticate) or calling tax.calculations
// directly; until one of those lands, do not re-add copy promising tax.

export const TRUE_BLUE_SERVICE_FEE_CENTS = 1800; // $18.00 service fee per beanie
const TRUE_BLUE_INBOUND_SHIP_CENTS = 0; // covered by the prepaid inbound label
// Return shipping is quoted per order, so it can't be added to a static
// figure here; the pricing panel renders the subtotal as "$18.00+" for it.
const TRUE_BLUE_RETURN_SHIP_CENTS = 0;

export const BX_BASIC_FEE_CENTS = 500; // $5.00 per beanie (authenticate + token + COA)
export const BX_FULL_FEE_CENTS = 2000; // $20.00 per beanie (grading tier — not currently offered)
// Bulk deal for Full + Grading: every block of 6 beanies costs a flat $100
// (vs $120 at the single rate); the remainder is billed per beanie.
export const BX_FULL_BULK_QTY = 6;
export const BX_FULL_BULK_CENTS = 10000; // $100.00 for a block of 6

// Back-compat exports used by /authentication-process and the wizard subtitle.
// They alias the True Blue figures so existing copy keeps working.
export const FULL_SERVICE_FEE_CENTS = TRUE_BLUE_SERVICE_FEE_CENTS;
export const INBOUND_SHIP_CENTS = TRUE_BLUE_INBOUND_SHIP_CENTS;
export const RETURN_SHIP_CENTS = TRUE_BLUE_RETURN_SHIP_CENTS;

/** Split a total into n integer parts that sum back to it exactly. */
export function splitEvenly(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

// Bulk submission across N beanies of the same provider/tier. Full + Grading
// gets the "6 for $100" deal; Basic and True Blue are linear. Shipping is not
// included here — BX shipping is rated at checkout and True Blue return
// shipping is quoted per order.
export type AuthBatchFees = {
  provider: AuthProvider;
  tier: AuthTier | null;
  quantity: number;
  /** Batch service fee (bulk applied). */
  serviceFeeCents: number;
  /** Even per-beanie split of serviceFeeCents; sums back exactly. */
  perBeanieServiceCents: number[];
};

function bxServiceFeeForQty(tier: AuthTier, qty: number): number {
  if (tier === "FULL_GRADING") {
    const blocks = Math.floor(qty / BX_FULL_BULK_QTY);
    const rem = qty % BX_FULL_BULK_QTY;
    return blocks * BX_FULL_BULK_CENTS + rem * BX_FULL_FEE_CENTS;
  }
  return qty * BX_BASIC_FEE_CENTS;
}

export function computeBatchAuthFees(
  provider: AuthProvider = "TRUE_BLUE",
  tier: AuthTier = "BASIC",
  quantity = 1,
): AuthBatchFees {
  const qty = Math.max(1, Math.floor(quantity));
  const isBx = provider === "BX_AUTHENTICATION";

  const serviceFeeCents = isBx
    ? bxServiceFeeForQty(tier, qty)
    : qty * TRUE_BLUE_SERVICE_FEE_CENTS;

  return {
    provider,
    tier: isBx ? tier : null,
    quantity: qty,
    serviceFeeCents,
    perBeanieServiceCents: splitEvenly(serviceFeeCents, qty),
  };
}

// --- Marketplace sale fees ---
// Authentication happens BEFORE listing, so every sale ships direct
// seller -> buyer (escrow released on buyer receipt confirmation).
//
// The platform fee comes out of the SELLER's proceeds — it is NOT an extra
// charge on top of what the buyer pays. So:
//   • the buyer pays  = item price + shipping        (`totalCents`)
//   • the seller nets = item price − platform fee    (`sellerProceedsCents`)
//   • the platform keeps the platform fee (+ the shipping leg it fulfils)
export type SaleFeeBreakdown = {
  itemCents: number;
  platformFeeCents: number;
  shipToBuyerCents: number;
  /** What the buyer pays: item + shipping (the platform fee is NOT added). */
  totalCents: number;
  /** What the seller receives: item price minus the platform fee. */
  sellerProceedsCents: number;
};

export function computeSaleFees(
  priceCents: number,
  /** Live-rated shipping when available; defaults to the flat fallback. */
  shipCents: number = SHIPPING_LEG_CENTS,
): SaleFeeBreakdown {
  const platformFeeCents = Math.round(priceCents * PLATFORM_FEE_PCT);
  const shipToBuyerCents = shipCents;
  return {
    itemCents: priceCents,
    platformFeeCents,
    shipToBuyerCents,
    // Buyer is charged the item price + shipping only. The platform fee is
    // taken from the seller's side (see sellerProceedsCents), not added here.
    totalCents: priceCents + shipToBuyerCents,
    sellerProceedsCents: priceCents - platformFeeCents,
  };
}

// One shared formatter (construction is expensive) with digit grouping, so
// every money display renders "$1,234.00" — the chart axes already grouped
// while formatCents callers didn't.
const USD_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatCents(cents: number): string {
  return USD_FORMAT.format(cents / 100);
}

export function authServiceLabel(
  _level?: AuthServiceLevel,
  provider: AuthProvider = "TRUE_BLUE",
  tier?: AuthTier | null,
): string {
  if (provider === "BX_AUTHENTICATION") {
    return tier === "FULL_GRADING"
      ? "Full Authentication + Grading (BX in-house)"
      : "Basic Authentication (BX in-house)";
  }
  return "Full Authentication (via True Blue)";
}
