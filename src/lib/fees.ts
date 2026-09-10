// All money in integer cents.
//
// THE platform fee. One constant, referenced by checkout (order rows), the
// payout transfer, the seller-facing fee disclosure on the sell form and the
// public fee page — change it here and every surface agrees.
export const PLATFORM_FEE_PCT = 0.1; // 10% of the item price, seller-side only
/** Display string for the platform fee, e.g. "10%". Keeps UI copy in sync. */
export const PLATFORM_FEE_LABEL = `${Math.round(PLATFORM_FEE_PCT * 100)}%`;

// Flat fallback for seller -> buyer shipping — used when the seller has no
// ship-from ZIP on file or a live EasyPost rate fails. Rated shipping is the
// norm (see rateSaleShipping in src/lib/shipping.ts).
export const SHIPPING_LEG_CENTS = 800;

// NO SALES TAX IS COLLECTED ON ANY FLOW TODAY. The figures below are the whole
// charge. Stripe Tax cannot attach to a bare PaymentIntent (`automatic_tax`
// exists on Checkout Sessions and Invoices), so collecting it means moving
// checkout onto Checkout Sessions or calling tax.calculations directly. Until
// one of those lands, do not add copy promising tax handling.

/** Split a total into n integer parts that sum back to it exactly. */
export function splitEvenly(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

// --- Marketplace sale fees ---
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

export function platformFeeCents(priceCents: number): number {
  return Math.round(priceCents * PLATFORM_FEE_PCT);
}

export function computeSaleFees(
  priceCents: number,
  /** Live-rated shipping when available; defaults to the flat fallback. */
  shipCents: number = SHIPPING_LEG_CENTS,
): SaleFeeBreakdown {
  const fee = platformFeeCents(priceCents);
  const shipToBuyerCents = shipCents;
  return {
    itemCents: priceCents,
    platformFeeCents: fee,
    shipToBuyerCents,
    // Buyer is charged the item price + shipping only. The platform fee is
    // taken from the seller's side (see sellerProceedsCents), not added here.
    totalCents: priceCents + shipToBuyerCents,
    sellerProceedsCents: priceCents - fee,
  };
}

// One shared formatter (construction is expensive) with digit grouping, so
// every money display renders "$1,234.00".
const USD_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatCents(cents: number): string {
  return USD_FORMAT.format(cents / 100);
}
