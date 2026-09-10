import { NextResponse } from "next/server";
import { clientIp } from "@/lib/clientIp";

/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * NOTE: in-memory state is per-machine. On multi-machine Fly this limits per
 * instance, not globally. Good enough as a prototype safeguard against abuse;
 * for production use a shared store (Redis / Upstash).
 */
type Window = { count: number; resetAt: number };
const buckets = new Map<string, Window>();

// The map would otherwise grow unbounded on a long-running server: one entry
// per unique `bucket:ip`, only ever overwritten when that exact key recurs.
// Sweep expired windows at most once per interval to keep it bounded.
const SWEEP_INTERVAL_MS = 60_000;
let lastSweep = Date.now();
function sweepExpired(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [k, w] of buckets) if (now > w.resetAt) buckets.delete(k);
}

/**
 * Returns a 429 NextResponse if the caller has exceeded `limit` requests
 * within `windowMs`, otherwise null (proceed).
 */
export function rateLimit(
  req: Request,
  bucket: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  const key = `${bucket}:${clientIp(req)}`;
  const now = Date.now();
  sweepExpired(now);
  const w = buckets.get(key);

  if (!w || now > w.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (w.count >= limit) {
    const retry = Math.ceil((w.resetAt - now) / 1000);
    return NextResponse.json(
      { error: "Too many requests — please slow down." },
      { status: 429, headers: { "Retry-After": String(retry) } },
    );
  }
  w.count += 1;
  return null;
}
