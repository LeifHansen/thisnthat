/**
 * Carrier tracking links for the order timeline and shipping emails.
 *
 * Sellers type the carrier name themselves (or EasyPost supplies it on a
 * bought label), so matching is loose: any string that mentions the carrier
 * resolves. Unknown carriers fall back to a web search for the number, which
 * still lands the buyer somewhere useful rather than nowhere.
 */
export function trackingUrl(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined,
): string | null {
  const num = (trackingNumber ?? "").trim();
  if (!num) return null;
  const c = (carrier ?? "").toLowerCase();
  const n = encodeURIComponent(num);
  if (c.includes("usps") || c.includes("postal")) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
  }
  if (c.includes("ups")) return `https://www.ups.com/track?tracknum=${n}`;
  if (c.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
  if (c.includes("dhl")) {
    return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${n}`;
  }
  if (c.includes("amazon")) {
    return `https://track.amazon.com/tracking/${n}`;
  }
  return `https://www.google.com/search?q=${n}`;
}

/** "USPS 9400 1234 …" — one line naming the carrier and the number. */
export function trackingLabel(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined,
): string {
  const c = (carrier ?? "").trim();
  const n = (trackingNumber ?? "").trim();
  if (c && n) return `${c} ${n}`;
  return c || n || "tracking not provided";
}
