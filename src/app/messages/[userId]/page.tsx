import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/guards";
import { getThread } from "@/lib/messages";
import { sendMessage } from "@/lib/messageActions";
import { Avatar } from "@/components/Avatar";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Conversation",
  robots: { index: false, follow: false },
};

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const me = await requireUser();
  if (userId === me.id) notFound();

  const thread = await getThread(me.id, userId);
  if (!thread) notFound();

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Link href="/messages" className="text-sm text-muted hover:!text-ink">
        ← All messages
      </Link>
      <div className="flex items-center gap-3">
        <Avatar
          src={thread.other.avatarUrl}
          name={thread.other.name}
          size={44}
        />
        <h1 className="text-2xl">
          <Link href={`/u/${thread.other.id}`} className="!text-ink hover:underline">
            {thread.other.name}
          </Link>
        </h1>
      </div>

      <div className="space-y-2">
        {thread.messages.length === 0 ? (
          <p className="text-muted text-sm">No messages yet — say hello 👋</p>
        ) : (
          thread.messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                m.mine
                  ? "ml-auto bg-[var(--bx-blue-bright)] text-ink"
                  : "bg-[var(--bx-surface)] border border-[var(--bx-line)]"
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p
                className={`text-[10px] mt-1 ${
                  m.mine ? "text-ink/60" : "text-muted"
                }`}
              >
                {m.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
              </p>
            </div>
          ))
        )}
      </div>

      <form
        action={sendMessage}
        className="flex gap-2 items-end sticky bottom-0 bg-[var(--bx-bg)] py-3"
      >
        <input type="hidden" name="toUserId" value={thread.other.id} />
        <textarea
          name="body"
          required
          rows={2}
          maxLength={4000}
          placeholder={`Message ${thread.other.name}…`}
          className="flex-1 rounded-xl border border-[var(--bx-line)] bg-white px-3 py-2 text-sm resize-y focus:outline-none focus:border-[var(--bx-line-strong)]"
        />
        <button type="submit" className="bx-btn">
          Send
        </button>
      </form>
    </div>
  );
}
