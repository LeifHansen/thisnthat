import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

// Bearer-token auth for the mobile app. The web uses Auth.js cookie sessions,
// which a native app can't carry — so mobile clients POST credentials to
// /api/mobile/auth/* and get a signed token here, sent back as
// `Authorization: Bearer <token>` on subsequent requests.
//
// The token is a minimal HS256 JWT signed with AUTH_SECRET (no dependency —
// Node crypto). It's stateless: revocation relies on the same DB checks the
// web session uses (a suspended user is rejected at read time, below), plus a
// 30-day expiry. Fine for this app; if per-token revocation is ever needed,
// swap in a DB session table.

const SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// A hand-off token rides in a URL query string, so it gets a tiny lifetime and
// is single-use (below). Long enough to survive a cold in-app browser opening
// on a slow connection, short enough that a leaked Referer or browser-history
// entry is worthless by the time anyone reads it.
export const HANDOFF_TTL_SECONDS = 90;

/**
 * What a token is allowed to do. `api` is the 30-day bearer credential the app
 * holds in the keychain; `handoff` only buys a web cookie session, once.
 *
 * These MUST stay separate. Without the distinction, the short-lived token we
 * put in a URL would also be a fully-powered API credential, and the API token
 * in the keychain could be replayed into a web session by anyone who got it.
 * Tokens issued before this claim existed carry no `purpose` and are treated
 * as `api`, which is what they were.
 */
export type TokenPurpose = "api" | "handoff";

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlJson(obj: unknown): string {
  return b64url(JSON.stringify(obj));
}

function sign(data: string): string {
  return b64url(createHmac("sha256", SECRET).update(data).digest());
}

export type MobileTokenClaims = { sub: string; email: string };

/** Issue a signed 30-day API token for a user. Throws if AUTH_SECRET is unset. */
export function signMobileToken(claims: MobileTokenClaims): string {
  return signToken(claims, "api", TOKEN_TTL_SECONDS);
}

/**
 * Issue a single-use, 90-second token that buys one web cookie session.
 * Carries a `jti` so it can be burned on redemption (see consumeHandoffToken).
 */
export function signHandoffToken(claims: MobileTokenClaims): string {
  return signToken(claims, "handoff", HANDOFF_TTL_SECONDS, randomUUID());
}

function signToken(
  claims: MobileTokenClaims,
  purpose: TokenPurpose,
  ttlSeconds: number,
  jti?: string,
): string {
  if (!SECRET) throw new Error("AUTH_SECRET is not configured");
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlJson({ alg: "HS256", typ: "JWT" });
  const payload = b64urlJson({
    ...claims,
    purpose,
    ...(jti ? { jti } : {}),
    iat: now,
    exp: now + ttlSeconds,
  });
  const body = `${header}.${payload}`;
  return `${body}.${sign(body)}`;
}

/**
 * Verify a token's signature, expiry AND purpose. Returns its claims or null.
 *
 * `purpose` is not optional-by-accident: callers must say what they will do
 * with the token, so a token minted for one job can never be spent on another.
 */
export function verifyMobileToken(
  token: string,
  purpose: TokenPurpose = "api",
): (MobileTokenClaims & { jti?: string }) | null {
  if (!SECRET || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;

  const expected = sign(`${header}.${payload}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
    ) as MobileTokenClaims & { exp?: number; purpose?: TokenPurpose; jti?: string };
    if (!claims.sub || typeof claims.exp !== "number") return null;
    if (claims.exp < Math.floor(Date.now() / 1000)) return null; // expired
    // Tokens minted before `purpose` existed are API tokens, which is what
    // they have always been used as.
    if ((claims.purpose ?? "api") !== purpose) return null;
    return { sub: claims.sub, email: claims.email, jti: claims.jti };
  } catch {
    return null;
  }
}

/** Extract the bearer token from a request's Authorization header, or null. */
export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

export type MobileUser = {
  id: string;
  name: string;
  displayName: string | null;
  email: string;
  role: "USER" | "ADMIN";
  avatarUrl: string | null;
};

/**
 * Resolve the authenticated user from a request's bearer token, or null.
 * Re-reads the DB every call so a suspended/deleted account loses access
 * immediately (the token stays valid but the user is gone) — the mobile
 * mirror of the web session's suspended check.
 */
export async function getMobileUser(req: Request): Promise<MobileUser | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const claims = verifyMobileToken(token, "api");
  if (!claims) return null;

  const user = await prisma.user
    .findUnique({
      where: { id: claims.sub },
      select: {
        id: true,
        name: true,
        displayName: true,
        email: true,
        role: true,
        avatarUrl: true,
        suspended: true,
      },
    })
    .catch(() => null);
  if (!user || user.suspended) return null;

  return {
    id: user.id,
    name: user.name,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl,
  };
}

// --- Hand-off redemption -----------------------------------------------------

// jti -> expiry, for hand-off tokens already spent. A hand-off token travels in
// a URL, which lands in browser history and can leak via Referer, so redeeming
// one must burn it.
//
// Like src/lib/rateLimit.ts this is per-machine, so on multi-machine Fly a
// token could in principle be replayed once per machine inside its 90-second
// window. That is a far smaller hole than an unlimited replay, and closing it
// completely means a shared store or a DB table; revisit alongside the Redis
// swap the rate limiter already wants.
const spentHandoffs = new Map<string, number>();
let lastHandoffSweep = Date.now();
const HANDOFF_SWEEP_INTERVAL_MS = 60_000;

function sweepSpentHandoffs(now: number): void {
  if (now - lastHandoffSweep < HANDOFF_SWEEP_INTERVAL_MS) return;
  lastHandoffSweep = now;
  for (const [jti, exp] of spentHandoffs) if (now > exp) spentHandoffs.delete(jti);
}

/**
 * Verify a hand-off token and burn it. Returns its claims the first time and
 * null on every later call — including for a token that is still unexpired.
 */
export function consumeHandoffToken(token: string): MobileTokenClaims | null {
  const claims = verifyMobileToken(token, "handoff");
  if (!claims?.jti) return null;

  const now = Date.now();
  sweepSpentHandoffs(now);
  if (spentHandoffs.has(claims.jti)) return null;
  spentHandoffs.set(claims.jti, now + HANDOFF_TTL_SECONDS * 1000);

  return { sub: claims.sub, email: claims.email };
}
