import { lookup } from "node:dns/promises";

/**
 * SSRF guard for server-side fetches of user-supplied URLs (photo-import,
 * blog-generate). Two layers:
 *   1. Textual host check — rejects localhost/.local/.internal and literal
 *      private/loopback/link-local IPs.
 *   2. DNS resolution — resolves the hostname and rejects if ANY resolved
 *      address is private, so a public hostname whose A record points at
 *      169.254.169.254 / 10.x / 127.x can't reach internal services.
 *
 * Residual risk: DNS rebinding (a different answer between this check and the
 * fetch's own resolution). Fully closing that needs connection-level IP
 * pinning; this covers the practical static-DNS SSRF vectors.
 */

function isPrivateIPv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local (cloud metadata endpoints)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const h = ip.toLowerCase();
  if (h === "::1") return true; // loopback
  if (h.startsWith("fe80")) return true; // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique local
  if (h.startsWith("::ffff:")) return isPrivateIPv4(h.slice(7)); // IPv4-mapped
  return false;
}

/** True if the hostname string is obviously internal (no DNS needed). */
export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  if (isPrivateIPv4(h)) return true;
  if (h.includes(":") && isPrivateIPv6(h)) return true;
  return false;
}

/**
 * Validate a user-supplied URL is safe to fetch server-side. Checks protocol,
 * length, textual host, and resolves DNS. Throws Error with a user-safe message
 * on rejection; returns the parsed URL on success.
 */
export async function assertFetchableUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }
  if (!/^https?:$/.test(url.protocol) || raw.length > 2048) {
    throw new Error("Only public http(s) URLs are allowed.");
  }
  if (isBlockedHost(url.hostname)) {
    throw new Error("That host isn't allowed.");
  }
  // Resolve DNS and reject if any address is private/internal.
  try {
    const addrs = await lookup(url.hostname, { all: true });
    for (const { address } of addrs) {
      if (isPrivateIPv4(address) || isPrivateIPv6(address)) {
        throw new Error("That host resolves to a private address.");
      }
    }
  } catch (e) {
    // A genuine resolution failure vs. our own rejection: re-throw ours,
    // and treat DNS errors as unfetchable.
    if (e instanceof Error && e.message.includes("private address")) throw e;
    throw new Error("Couldn't resolve that host.");
  }
  return url;
}

/**
 * Fetch a user-supplied URL with the SSRF guard applied to EVERY hop.
 * `redirect: "follow"` would validate only the first hostname — a public host
 * can 302 to an internal one — so redirects are followed manually here, with
 * assertFetchableUrl re-run on each Location before it is fetched.
 */
export async function fetchPublicUrl(
  raw: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 15_000, ...rest } = init;
  let url = await assertFetchableUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, {
      ...rest,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      // A redirect with no Location can't be followed; surface it as-is.
      if (!loc) return res;
      res.body?.cancel();
      url = await assertFetchableUrl(new URL(loc, url).toString());
      continue;
    }
    return res;
  }
  throw new Error("That URL redirects too many times.");
}
