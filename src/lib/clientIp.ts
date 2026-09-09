/**
 * The end user's IP address for a request, as seen from behind Cloudflare.
 *
 * The production domain is proxied through Cloudflare (DNS resolves to Cloudflare
 * anycast; responses carry `server: cloudflare` and a `cf-ray`), so the peer
 * Fly reports in `Fly-Client-IP` is a *Cloudflare edge node*, not the visitor.
 * Keying anything per-user off that header lumps every visitor sharing a
 * Cloudflare PoP into one identity.
 *
 * Cloudflare puts the real address in `CF-Connecting-IP`. That header is only
 * trustworthy when the request actually arrived through Cloudflare: the Fly
 * origin also answers directly on its *.fly.dev hostname, where anyone can set
 * it to whatever they like. So it is honoured only when the connecting peer is
 * itself a Cloudflare address — otherwise we fall back to the peer, which Fly
 * sets and a client cannot forge.
 *
 * `X-Forwarded-For` is deliberately never consulted: its leftmost entry is
 * client-controlled on a direct-to-origin request.
 */

// Cloudflare's published edge ranges — https://www.cloudflare.com/ips/
// These change rarely; a stale entry fails safe (we fall back to the peer IP
// and bucket per-PoP, which is today's behaviour, rather than trusting a
// header we shouldn't).
const CLOUDFLARE_CIDRS = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

/**
 * Addresses are compared as fixed-width strings of "0"/"1" — 32 characters for
 * IPv4, 128 for IPv6 — which turns "is this address inside that CIDR" into a
 * prefix comparison. BigInt would be the obvious tool, but this project
 * compiles to ES2017 where BigInt literals aren't available, and a bit string
 * needs no arithmetic to get right.
 */
type Bits = string;

function bin(value: number, width: number): Bits {
  return value.toString(2).padStart(width, "0");
}

function v4Bits(ip: string): Bits | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let bits = "";
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    bits += bin(n, 8);
  }
  return bits;
}

function v6Bits(ip: string): Bits | null {
  // Drop any zone id ("fe80::1%eth0").
  let text = ip.split("%")[0];

  // An embedded IPv4 tail ("::ffff:203.0.113.7") — fold it into two hextets.
  const embedded = text.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (embedded) {
    const tail = v4Bits(embedded[2]);
    if (tail === null) return null;
    const hi = parseInt(tail.slice(0, 16), 2).toString(16);
    const lo = parseInt(tail.slice(16), 2).toString(16);
    text = `${embedded[1]}${hi}:${lo}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];

  let groups: string[];
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    groups = [...head, ...Array<string>(fill).fill("0"), ...tail];
  } else {
    if (head.length !== 8) return null;
    groups = head;
  }

  let bits = "";
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    bits += bin(parseInt(group, 16), 16);
  }
  return bits;
}

/** IPv4-mapped IPv6 space (::ffff:0:0/96), so a mapped address matches v4 nets. */
const V4_MAPPED_PREFIX = `${"0".repeat(80)}${"1".repeat(16)}`;

function addrBits(ip: string): Bits | null {
  const text = ip.trim();
  if (!text) return null;

  if (text.includes(":")) {
    const bits = v6Bits(text);
    if (bits === null) return null;
    // Compare a mapped address against IPv4 ranges, not IPv6 ones.
    return bits.startsWith(V4_MAPPED_PREFIX) ? bits.slice(96) : bits;
  }

  return v4Bits(text);
}

type Net = { prefix: Bits; width: number };

function parseNet(cidr: string): Net | null {
  const [ip, len] = cidr.split("/");
  const bits = addrBits(ip);
  if (!bits || len === undefined) return null;
  const length = Number(len);
  if (!Number.isInteger(length) || length < 0 || length > bits.length) {
    return null;
  }
  return { prefix: bits.slice(0, length), width: bits.length };
}

const CLOUDFLARE_NETS: Net[] = CLOUDFLARE_CIDRS.map(parseNet).filter(
  (n): n is Net => n !== null,
);

/** Whether `ip` falls inside one of Cloudflare's published edge ranges. */
export function isCloudflareEdge(ip: string): boolean {
  const bits = addrBits(ip);
  if (!bits) return false;
  for (const net of CLOUDFLARE_NETS) {
    // Width guards against an IPv4 address matching an IPv6 prefix by accident.
    if (net.width === bits.length && bits.startsWith(net.prefix)) return true;
  }
  return false;
}

/**
 * The requesting end user's IP, or "unknown" when it can't be determined.
 *
 * Off-Fly traffic (no Fly-Client-IP at all) shares the single "unknown"
 * bucket — failing closed rather than open.
 */
export function clientIp(req: Request): string {
  const peer = req.headers.get("fly-client-ip")?.trim() ?? "";

  if (peer && isCloudflareEdge(peer)) {
    const forwarded = req.headers.get("cf-connecting-ip")?.trim();
    if (forwarded) return forwarded;
  }

  return peer || "unknown";
}
