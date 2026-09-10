// Shared site identity + email sender config. Kept in one place so email
// templates, unsubscribe links, metadata and legal pages agree on the
// canonical URL/name.

export const SITE_NAME = "This'n'that";
export const SITE_TAGLINE = "Sell what you have. Find what you need.";

// Canonical origin. SITE_URL wins (set it in production); the public app URL
// is the fallback so local dev and preview builds still produce working
// absolute links in emails.
export const SITE_URL = (
  process.env.SITE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "https://thisnthat.fly.dev"
).replace(/\/+$/, "");

export const SUPPORT_EMAIL =
  process.env.SUPPORT_EMAIL ?? "support@thisnthat.com";

// The verified sender for outbound mail. Must be a domain you've
// authenticated in SendGrid (SPF/DKIM), or delivery will fail / land in spam.
export const EMAIL_FROM =
  process.env.SENDGRID_FROM ?? "notifications@thisnthat.com";
export const EMAIL_FROM_NAME = SITE_NAME;

/** Absolute URL helper for use in emails (links must be fully-qualified). */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}
