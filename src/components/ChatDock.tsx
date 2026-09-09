"use client";

/**
 * Reddit-style DM dock: a pill pinned to the bottom-right that pops up into a
 * chat window — conversation list, thread view with bubbles, composer with
 * Enter-to-send, optimistic sends, and light polling for new messages. The
 * full-page /messages inbox still works; this is the fast path.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import {
  minimizeChat,
  openChat,
  showConversationList,
  useChatDock,
} from "@/lib/chatDock";
import { toast } from "@/lib/toast";

type Summary = {
  otherId: string;
  otherName: string;
  otherAvatarUrl: string | null;
  lastBody: string | null;
  lastAt: string;
  unread: number;
};

type ThreadMessage = {
  id: string;
  body: string;
  mine: boolean;
  createdAt: string;
  pending?: boolean;
};

type Thread = {
  other: { id: string; name: string; avatarUrl: string | null };
  messages: ThreadMessage[];
};

// The dock is mounted site-wide, so its polling is a fleet-wide DB load
// multiplier: poll gently when closed (badge freshness only), faster once
// the user is actually looking at it.
const CLOSED_POLL_MS = 60_000;
const LIST_POLL_MS = 20_000;
const THREAD_POLL_MS = 5_000;

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function bubbleTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ChatDock({
  loggedIn,
  initialUnread,
}: {
  loggedIn: boolean;
  initialUnread: number;
}) {
  const { open, otherId } = useChatDock();
  const [conversations, setConversations] = useState<Summary[] | null>(null);
  const [unread, setUnread] = useState(initialUnread);
  const [thread, setThread] = useState<Thread | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch("/api/messages", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        conversations: Summary[];
        unread: number;
      };
      setConversations(data.conversations);
      setUnread(data.unread);
    } catch {
      /* transient network error — next poll retries */
    }
  }, []);

  const refreshThread = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/messages/${id}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Thread;
      // Keep optimistic (pending) sends visible until the server echoes them.
      setThread((prev) => {
        const pending =
          prev?.other.id === id
            ? prev.messages.filter(
                (m) => m.pending && !data.messages.some((s) => s.body === m.body && s.mine),
              )
            : [];
        return { ...data, messages: [...data.messages, ...pending] };
      });
      // Opening/refreshing a thread marks it read server-side; the paired
      // refreshList() call corrects the total badge.
      setConversations((prev) =>
        prev
          ? prev.map((c) => (c.otherId === id ? { ...c, unread: 0 } : c))
          : prev,
      );
    } catch {
      /* transient network error — next poll retries */
    }
  }, []);

  // Load immediately when the dock opens or the partner changes, then poll —
  // thread fast, list slower. Only the recurring polls pause in hidden tabs;
  // the initial load always runs so the dock never sits on "Loading…".
  useEffect(() => {
    if (!loggedIn) return;
    const load = () => {
      if (open && otherId) refreshThread(otherId);
      refreshList();
    };
    if (open) load();
    const interval = !open
      ? CLOSED_POLL_MS
      : otherId
        ? THREAD_POLL_MS
        : LIST_POLL_MS;
    const timer = setInterval(() => {
      if (document.hidden) return;
      load();
    }, interval);
    return () => clearInterval(timer);
  }, [loggedIn, open, otherId, refreshList, refreshThread]);

  // Stick to the bottom when messages change.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread, open, otherId]);

  if (!loggedIn) return null;

  async function send() {
    const body = draft.trim();
    if (!body || !otherId || sending) return;
    setSending(true);
    setDraft("");
    const optimistic: ThreadMessage = {
      id: `pending-${Date.now()}`,
      body,
      mine: true,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setThread((prev) =>
      prev && prev.other.id === otherId
        ? { ...prev, messages: [...prev.messages, optimistic] }
        : prev,
    );
    try {
      const res = await fetch(`/api/messages/${otherId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Couldn't send message");
      }
      await refreshThread(otherId);
      refreshList();
    } catch (e) {
      // Roll back the optimistic bubble and restore the draft.
      setThread((prev) =>
        prev
          ? {
              ...prev,
              messages: prev.messages.filter((m) => m.id !== optimistic.id),
            }
          : prev,
      );
      setDraft(body);
      toast.error(e instanceof Error ? e.message : "Couldn't send message");
    } finally {
      setSending(false);
      composerRef.current?.focus();
    }
  }

  // Thread state can briefly hold the previous partner's messages after a
  // switch — treat a mismatch as "loading" instead of resetting in an effect.
  const activeThread = thread && thread.other.id === otherId ? thread : null;
  const activeSummary = conversations?.find((c) => c.otherId === otherId);
  const headerName =
    activeThread?.other.name ?? activeSummary?.otherName ?? "…";
  const headerAvatar =
    activeThread?.other.avatarUrl ?? activeSummary?.otherAvatarUrl ?? null;

  // ── Collapsed pill ────────────────────────────────────────────
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => openChat()}
        className="fixed bottom-0 right-3 sm:right-6 z-40 flex items-center gap-2 rounded-t-2xl border-2 border-b-0 border-[var(--tnt-ink)] bg-white px-4 py-2.5 text-sm font-bold !text-ink shadow-[0_-2px_10px_rgba(43,35,80,0.15)] hover:pb-3.5 transition-all"
        aria-label={`Open messages${unread > 0 ? ` (${unread} unread)` : ""}`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4.5 w-4.5"
          aria-hidden
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Messages
        {unread > 0 && (
          <span className="rounded-full bg-[var(--tnt-red)] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
    );
  }

  // ── Open window ───────────────────────────────────────────────
  return (
    <div
      className="fixed bottom-0 right-0 sm:right-6 z-40 flex h-[70vh] max-h-[32rem] w-full flex-col rounded-t-2xl border-2 border-b-0 border-[var(--tnt-ink)] bg-white shadow-[0_-4px_24px_rgba(43,35,80,0.25)] sm:w-96 tnt-dock-in"
      role="dialog"
      aria-label="Messages"
    >
      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-[14px] border-b-2 border-[var(--tnt-ink)] bg-[var(--tnt-surface)] px-3 py-2.5">
        {otherId ? (
          <>
            <button
              type="button"
              onClick={showConversationList}
              aria-label="Back to conversations"
              className="rounded-full p-1 hover:bg-black/5 text-lg leading-none"
            >
              ←
            </button>
            <Avatar src={headerAvatar} name={headerName} size={28} />
            <Link
              href={`/u/${otherId}`}
              className="min-w-0 flex-1 truncate font-bold !text-ink hover:underline"
            >
              {headerName}
            </Link>
          </>
        ) : (
          <p className="flex-1 font-bold">Messages</p>
        )}
        <Link
          href={otherId ? `/messages/${otherId}` : "/messages"}
          aria-label="Open full messages page"
          title="Open full page"
          className="rounded-full p-1.5 hover:bg-black/5 !text-ink"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden
          >
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          </svg>
        </Link>
        <button
          type="button"
          onClick={minimizeChat}
          aria-label="Minimize messages"
          className="rounded-full p-1 px-2 hover:bg-black/5 text-xl leading-none font-bold"
        >
          –
        </button>
      </div>

      {/* Body */}
      {otherId ? (
        <>
          <div
            ref={scrollRef}
            className="flex-1 space-y-2 overflow-y-auto px-3 py-3"
          >
            {activeThread === null ? (
              <p className="pt-8 text-center text-sm text-muted">Loading…</p>
            ) : activeThread.messages.length === 0 ? (
              <p className="pt-8 text-center text-sm text-muted">
                Say hi to {headerName} 👋
              </p>
            ) : (
              activeThread.messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-snug whitespace-pre-wrap break-words ${
                    m.mine
                      ? "ml-auto bg-[var(--tnt-blue-bright)] text-ink rounded-br-md"
                      : "bg-[var(--tnt-surface)] border border-[var(--tnt-line)] rounded-bl-md"
                  } ${m.pending ? "opacity-60" : ""}`}
                >
                  {m.body}
                  <span className="mt-0.5 block text-[10px] text-black/45 text-right">
                    {m.pending ? "sending…" : bubbleTime(m.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-[var(--tnt-line)] p-2.5">
            <div className="flex items-end gap-2">
              <textarea
                ref={composerRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                maxLength={4000}
                placeholder="Message…"
                aria-label={`Message ${headerName}`}
                className="tnt-input !py-2 max-h-28 min-h-[2.5rem] flex-1 resize-none"
              />
              <button
                type="button"
                onClick={send}
                disabled={sending || !draft.trim()}
                className="tnt-btn !px-4 !py-2 shrink-0 disabled:opacity-50"
              >
                Send
              </button>
            </div>
            <p className="mt-1 px-1 text-[10px] text-muted">
              Enter to send · Shift+Enter for a new line
            </p>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {conversations === null ? (
            <p className="pt-8 text-center text-sm text-muted">Loading…</p>
          ) : conversations.length === 0 ? (
            <div className="space-y-2 px-6 pt-10 text-center text-sm text-muted">
              <p className="font-semibold text-ink">No messages yet</p>
              <p>
                Find a listing you love and hit “Message Seller” to start a
                conversation.
              </p>
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.otherId}
                type="button"
                onClick={() => openChat(c.otherId)}
                className="flex w-full items-center gap-3 border-b border-[var(--tnt-line)] px-3 py-3 text-left hover:bg-[var(--tnt-surface)]"
              >
                <Avatar src={c.otherAvatarUrl} name={c.otherName} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span
                      className={`truncate text-sm ${c.unread > 0 ? "font-bold" : "font-semibold"}`}
                    >
                      {c.otherName}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted">
                      {timeAgo(c.lastAt)}
                    </span>
                  </span>
                  <span
                    className={`block truncate text-xs ${c.unread > 0 ? "font-semibold text-ink" : "text-muted"}`}
                  >
                    {c.lastBody ?? "—"}
                  </span>
                </span>
                {c.unread > 0 && (
                  <span className="shrink-0 rounded-full bg-[var(--tnt-red)] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    {c.unread > 99 ? "99+" : c.unread}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
