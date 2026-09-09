// Shared site identity + email sender config. Kept in one place so email
// templates, unsubscribe links, and metadata agree on the canonical URL/name.
// (Page metadata still inlines these in a few files; this module is the source
// of truth for anything email-related.)

export const SITE_URL = (
  process.env.SITE_URL ?? "https://beaniexchange.com"
).replace(/\/+$/, "");

export const SITE_NAME = "BeanieXchange";

// The verified sender for outbound mail. Must be a domain you've
// authenticated in SendGrid (SPF/DKIM), or delivery will fail / land in spam.
export const EMAIL_FROM =
  process.env.SENDGRID_FROM ?? "notifications@beaniexchange.com";
export const EMAIL_FROM_NAME = SITE_NAME;

/** Absolute URL helper for use in emails (links must be fully-qualified). */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Physical HQ address: the authentication center parcels are sent to and
 * returned from. Lives here (not in guards.ts) so shipping code can import it
 * without pulling in next/navigation.
 */
export const HQ_ADDRESS = {
  name: "Beanie Xchange HQ",
  line1: process.env.HQ_LINE1 ?? "9221 32nd Ave SW",
  city: process.env.HQ_CITY ?? "Seattle",
  state: process.env.HQ_STATE ?? "WA",
  postalCode: process.env.HQ_POSTAL ?? "98126",
  country: "US",
};
