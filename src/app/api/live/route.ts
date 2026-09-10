import { NextResponse } from "next/server";

// Liveness probe for the platform (Fly http checks). Answers 200 as soon as
// the server is listening, with no database or configuration checks — that
// is what /api/health is for. A probe that could 503 on a missing Stripe key
// would have Fly restart a perfectly healthy machine.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true });
}
