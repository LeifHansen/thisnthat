// Server-action callers that catch errors (to show a message inline) must let
// Next's redirect() control-flow exception keep propagating. One shared check
// instead of a hand-rolled digest sniff per wizard.
export function isNextRedirectError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/**
 * A post-navigation destination that is safe to send a browser to, or null.
 *
 * Only same-site paths qualify: an absolute URL or a protocol-relative
 * "//host" would turn any `?next=` parameter into an open redirect, which is
 * worth rather more than usual on the two flows that use this, since both hand
 * the browser a freshly signed-in session on the way through.
 */
export function safeInternalPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}
