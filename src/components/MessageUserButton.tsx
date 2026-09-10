"use client";

import Link from "next/link";
import { openChat } from "@/lib/chatDock";

/**
 * "Message …" entry point: opens the chat dock directly on that user's
 * thread. Logged-out users go to sign-in and land back where they were.
 */
export function MessageUserButton({
  userId,
  loggedIn,
  label = "Message",
  className = "tnt-btn tnt-btn--ghost",
  callbackPath,
}: {
  userId: string;
  loggedIn: boolean;
  label?: string;
  className?: string;
  callbackPath?: string;
}) {
  if (!loggedIn) {
    const next = callbackPath ?? `/messages/${userId}`;
    return (
      <Link
        href={`/auth/signin?next=${encodeURIComponent(next)}`}
        className={className}
      >
        {label}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={() => openChat(userId)}>
      {label}
    </button>
  );
}
