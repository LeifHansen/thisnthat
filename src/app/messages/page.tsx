import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/guards";
import { listConversations } from "@/lib/messages";
import { Avatar } from "@/components/Avatar";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false, follow: false },
};

export default async function MessagesPage() {
  const user = await requireUser();
  const convos = await listConversations(user.id);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl">Messages</h1>

      {convos.length === 0 ? (
        <p className="text-muted">
          No messages yet. Open any listing and tap{" "}
          <b>💬 Message seller</b> to start a conversation.
        </p>
      ) : (
        <div className="space-y-2">
          {convos.map((c) => (
            <Link
              key={c.otherId}
              href={`/messages/${c.otherId}`}
              className="tnt-panel px-4 py-3 flex items-center justify-between gap-3 !text-ink hover:border-[var(--tnt-line-strong)]"
            >
              <Avatar src={c.otherAvatarUrl} name={c.otherName} size={40} />
              <span className="min-w-0 flex-1">
                <span className="font-semibold flex items-center gap-2">
                  {c.otherName}
                  {c.unread > 0 && (
                    <span className="rounded-full bg-[var(--tnt-red)] text-white text-xs font-bold px-2 py-0.5">
                      {c.unread}
                    </span>
                  )}
                </span>
                {c.lastBody && (
                  <span
                    className={`block text-sm truncate ${
                      c.unread > 0 ? "text-ink font-medium" : "text-muted"
                    }`}
                  >
                    {c.lastBody}
                  </span>
                )}
              </span>
              <span className="text-xs text-muted shrink-0">
                {c.lastAt.toISOString().slice(0, 10)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
