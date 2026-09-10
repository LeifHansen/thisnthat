import { SITE_URL, SUPPORT_EMAIL } from "@/lib/site";

// Served at /.well-known/security.txt per RFC 9116 so security researchers
// have a documented way to report vulnerabilities. The `Expires` field is
// required by the RFC and must be in the future, so it is computed at request
// time (always ~1 year out) rather than hardcoded to a date that goes stale.
export const dynamic = "force-dynamic";

export function GET() {
  const expires = new Date();
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);

  const body = [
    `Contact: mailto:${SUPPORT_EMAIL}`,
    `Expires: ${expires.toISOString()}`,
    `Preferred-Languages: en`,
    `Canonical: ${SITE_URL}/.well-known/security.txt`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
