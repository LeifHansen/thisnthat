import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listConversations, unreadTotal } from "@/lib/messages";

/** Chat-dock inbox: conversation summaries + total unread, newest first. */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const meId = session.user.id;
  const [conversations, unread] = await Promise.all([
    listConversations(meId),
    unreadTotal(meId),
  ]);
  return NextResponse.json({ conversations, unread });
}
