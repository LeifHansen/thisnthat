import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

// Sink for Core Web Vitals beacons (navigator.sendBeacon from WebVitalsReporter).
// Logs one compact line per metric — especially `target`, the element behind a
// layout shift or slow LCP — so field CWV shows up in `fly logs`. Best-effort:
// never throws to the client, returns 204 regardless.
export async function POST(req: Request) {
  const limited = rateLimit(req, "vitals", 60, 60_000);
  if (limited) return limited;

  try {
    const text = await req.text();
    if (text && text.length <= 2000) {
      const d = JSON.parse(text) as {
        name?: unknown;
        value?: unknown;
        rating?: unknown;
        path?: unknown;
        target?: unknown;
      };
      // Strip control chars from client-supplied strings so a crafted beacon
      // can't forge extra lines in the logs (log injection).
      const clean = (v: string, n = 200) =>
        v.replace(/[\r\n\t]+/g, " ").slice(0, n);
      const name = clean(String(d.name ?? "?"), 32);
      const value = Number(d.value);
      const rating = clean(String(d.rating ?? "?"), 24);
      const path = clean(String(d.path ?? "?"));
      const target = d.target ? clean(String(d.target)) : "";
      console.log(
        `[web-vitals] ${name} ${rating} ${Number.isFinite(value) ? value : "?"} ` +
          `path=${path}${target ? ` target=${target}` : ""}`,
      );
    }
  } catch {
    // malformed beacon — ignore
  }
  return new NextResponse(null, { status: 204 });
}
