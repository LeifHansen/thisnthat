// Tracked outbound partner links. Egress to a partner site goes through
// /out/<target>, which records an OutboundClick row and 302-redirects to the
// real destination, so the superadmin dashboard can report all-time clicks.
// Client-safe: constants only, no server imports.
export const OUTBOUND_TARGETS = {
  // #packages lands visitors on True Blue's intake/pricing section — we no
  // longer process True Blue transactions in-app, so every egress link doubles
  // as the submission entry point.
  "true-blue": "https://truebluebeans.com/#packages",
} as const;

export type OutboundTarget = keyof typeof OUTBOUND_TARGETS;

/**
 * Href for a tracked egress link. `source` labels the placement the click
 * came from (e.g. "footer", "authenticate") and is stored with the click.
 */
export function outboundHref(target: OutboundTarget, source?: string): string {
  return `/out/${target}${source ? `?src=${encodeURIComponent(source)}` : ""}`;
}
