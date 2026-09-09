import "server-only";
import { prisma } from "@/lib/db";
import { displayNameOf } from "@/lib/users";
import * as notify from "@/lib/notify";

// A conversation is keyed by an unordered pair of users. We canonicalise the
// pair (smaller id = userA) so each pair maps to exactly one row and the
// @@unique([userAId, userBId]) constraint does the dedup for us.
function conversationPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function getOrCreateConversation(meId: string, otherId: string) {
  const [userAId, userBId] = conversationPair(meId, otherId);
  return prisma.conversation.upsert({
    where: { userAId_userBId: { userAId, userBId } },
    create: { userAId, userBId },
    update: {},
  });
}

export type ConversationSummary = {
  otherId: string;
  otherName: string;
  otherAvatarUrl: string | null;
  lastBody: string | null;
  lastAt: Date;
  unread: number;
};

const OTHER_SELECT = {
  id: true,
  name: true,
  displayName: true,
  avatarUrl: true,
} as const;

/** Inbox: every conversation I'm in, newest first, with unread counts. */
export async function listConversations(
  meId: string,
): Promise<ConversationSummary[]> {
  try {
    const convos = await prisma.conversation.findMany({
      where: { OR: [{ userAId: meId }, { userBId: meId }] },
      orderBy: { lastMessageAt: "desc" },
      // The dock shows a scrollable inbox, not an archive — cap it so a
      // power seller's every-buyer-ever history isn't re-read on each poll.
      take: 30,
      include: {
        userA: { select: OTHER_SELECT },
        userB: { select: OTHER_SELECT },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true },
        },
      },
    });
    if (convos.length === 0) return [];

    const unreadRows = await prisma.message.groupBy({
      by: ["conversationId"],
      where: {
        conversationId: { in: convos.map((c) => c.id) },
        senderId: { not: meId },
        readAt: null,
      },
      _count: { _all: true },
    });
    const unreadByConvo = new Map(
      unreadRows.map((r) => [r.conversationId, r._count._all]),
    );

    return convos.map((c) => {
      const other = c.userAId === meId ? c.userB : c.userA;
      return {
        otherId: other.id,
        otherName: displayNameOf(other),
        otherAvatarUrl: other.avatarUrl,
        lastBody: c.messages[0]?.body ?? null,
        lastAt: c.lastMessageAt,
        unread: unreadByConvo.get(c.id) ?? 0,
      };
    });
  } catch (e) {
    // Degrade to an empty inbox rather than crashing the page if the messaging
    // tables aren't present yet (e.g. migration not applied on this env).
    console.error("[messages] listConversations failed:", e);
    return [];
  }
}

/** Total unread messages across all of my conversations (for the nav badge). */
export async function unreadTotal(meId: string): Promise<number> {
  try {
    return await prisma.message.count({
      where: {
        senderId: { not: meId },
        readAt: null,
        conversation: { OR: [{ userAId: meId }, { userBId: meId }] },
      },
    });
  } catch {
    return 0;
  }
}

type ThreadMessage = {
  id: string;
  body: string;
  mine: boolean;
  createdAt: Date;
};

/**
 * Load a conversation between me and `otherId`, marking the other side's
 * messages read on open. Returns null if the other user doesn't exist (or the
 * messaging tables aren't available yet) so callers can 404 instead of crash.
 */
export async function getThread(meId: string, otherId: string) {
  try {
    const [userAId, userBId] = conversationPair(meId, otherId);
    // The user lookup and the conversation page are independent — fetch them
    // together (the dock polls this every few seconds per open chat).
    // Messages: latest page only (a long negotiation must not re-transfer its
    // whole history each time), fetched newest-first for the bound, then
    // flipped back to chronological.
    const [otherRow, convo] = await Promise.all([
      prisma.user.findUnique({
        where: { id: otherId },
        select: OTHER_SELECT,
      }),
      prisma.conversation.findUnique({
        where: { userAId_userBId: { userAId, userBId } },
        include: {
          messages: { orderBy: { createdAt: "desc" }, take: 100 },
        },
      }),
    ]);
    if (!otherRow) return null;
    const other = {
      id: otherRow.id,
      name: displayNameOf(otherRow),
      avatarUrl: otherRow.avatarUrl,
    };
    convo?.messages.reverse();

    // Lazy read-receipt: opening the thread clears my unread for it. Skip the
    // write entirely when nothing in the fetched page is unread — the common
    // case on every poll.
    if (
      convo &&
      convo.messages.some((m) => m.senderId !== meId && m.readAt === null)
    ) {
      await prisma.message.updateMany({
        where: {
          conversationId: convo.id,
          senderId: { not: meId },
          readAt: null,
        },
        data: { readAt: new Date() },
      });
    }

    const messages: ThreadMessage[] = (convo?.messages ?? []).map((m) => ({
      id: m.id,
      body: m.body,
      mine: m.senderId === meId,
      createdAt: m.createdAt,
    }));

    return { other, messages };
  } catch (e) {
    console.error("[messages] getThread failed:", e);
    return null;
  }
}

export const MAX_MESSAGE_LENGTH = 4000;

/**
 * Core DM send shared by the /messages form action and the chat-dock API:
 * validates, creates (or revives) the conversation, writes the message, and
 * bumps lastMessageAt in one transaction. Throws Error with a user-safe
 * message on invalid input.
 */
export async function sendMessageCore(
  meId: string,
  otherId: string,
  rawBody: string,
) {
  const body = rawBody.trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!body) throw new Error("Message can't be empty");
  if (otherId === meId) throw new Error("You can't message yourself");

  const other = await prisma.user.findUnique({
    where: { id: otherId },
    select: { id: true },
  });
  if (!other) throw new Error("That user doesn't exist");

  const convo = await getOrCreateConversation(meId, otherId);
  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: { conversationId: convo.id, senderId: meId, body },
    }),
    prisma.conversation.update({
      where: { id: convo.id },
      data: { lastMessageAt: new Date() },
    }),
  ]);
  // Email the recipient (gated on their notifyMessages pref). Fire-and-forget
  // so the send never blocks the DM round-trip.
  void notify.newMessage(meId, otherId, body);
  return message;
}
