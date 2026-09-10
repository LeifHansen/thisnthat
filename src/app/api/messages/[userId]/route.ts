import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { getThread, sendMessageCore } from "@/lib/messages";

/** Chat-dock thread: full history with `otherId` (marks their side read). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = await params;
  const thread = await getThread(session.user.id, userId);
  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(thread);
}

/** Chat-dock send: { body } → the created message. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const limited = rateLimit(req, "dm-send", 30, 60_000);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId } = await params;

  let body = "";
  try {
    const json = (await req.json()) as { body?: unknown };
    body = String(json.body ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const message = await sendMessageCore(session.user.id, userId, body);
    return NextResponse.json({
      id: message.id,
      body: message.body,
      mine: true,
      createdAt: message.createdAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Couldn't send message";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
