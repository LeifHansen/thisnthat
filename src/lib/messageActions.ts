"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { sendMessageCore } from "@/lib/messages";

/**
 * Send a DM. Used as a form action from the /messages conversation thread
 * (the chat dock posts to /api/messages/[userId] instead, sharing
 * sendMessageCore). Creates the conversation on first contact, appends the
 * message, and bumps lastMessageAt so it sorts to the top of both inboxes.
 */
export async function sendMessage(formData: FormData) {
  const session = await auth();
  const otherId = String(formData.get("toUserId") ?? "").trim();
  if (!session?.user) {
    redirect(`/auth/signin?next=${encodeURIComponent(`/messages/${otherId}`)}`);
  }
  const meId = session.user.id;
  const body = String(formData.get("body") ?? "");

  if (!otherId) return;
  try {
    await sendMessageCore(meId, otherId, body);
  } catch {
    // Empty body / self-message / unknown user — bounce back to the thread.
    if (otherId !== meId) redirect(`/messages/${otherId}`);
    return;
  }

  revalidatePath("/messages");
  redirect(`/messages/${otherId}`);
}
