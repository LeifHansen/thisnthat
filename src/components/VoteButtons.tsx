"use client";

import { useOptimistic, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { vote } from "@/lib/forum";

/**
 * Up/down vote pill for a thread or reply.
 *
 * This used to be a server component with two plain `<form action={vote}>`
 * elements and no client JS. The vote was written, but the score never
 * moved: the action never resolved on the client (see the caching note in
 * lib/forum.ts), so the page kept showing the old score until a manual
 * reload — which is what made the forum feel broken. We now call the action
 * from a transition, paint the new score optimistically, and reconcile with
 * the server via `router.refresh()`, the same way RemovableRow and the order
 * flows do.
 *
 * `myVote` highlights the side the current user already voted on.
 */
export function VoteButtons({
  target,
  id,
  score,
  myVote = 0,
  size = "md",
  signedIn,
}: {
  target: "thread" | "post";
  id: string;
  score: number;
  myVote?: number; // -1, 0, +1
  size?: "sm" | "md";
  signedIn: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  // Mirrors the server's net-delta maths in `vote()`: clicking the side you
  // already picked clears the vote, the other side flips it.
  const [shown, applyVote] = useOptimistic(
    { score, myVote },
    (current, next: number) => {
      const cleared = current.myVote === next;
      return {
        score: current.score - current.myVote + (cleared ? 0 : next),
        myVote: cleared ? 0 : next,
      };
    },
  );

  const btn =
    size === "sm"
      ? "px-2.5 py-1.5 sm:px-1.5 sm:py-0.5 text-xs leading-none"
      : "px-3 py-2 sm:px-2 sm:py-1 text-sm leading-none";

  const upActive = shown.myVote === 1;
  const downActive = shown.myVote === -1;

  // If signed out, render plain links that send the user to sign-in and back
  // to the page they were voting from.
  if (!signedIn) {
    const next = `/auth/signin?next=${encodeURIComponent(pathname)}`;
    return (
      <div className="inline-flex flex-col items-center gap-0.5 select-none">
        <a
          href={next}
          className={`bx-btn bx-btn--ghost ${btn}`}
          aria-label="Sign in to upvote"
        >
          ▲
        </a>
        <span className="font-semibold text-sm tabular-nums">{score}</span>
        <a
          href={next}
          className={`bx-btn bx-btn--ghost ${btn}`}
          aria-label="Sign in to downvote"
        >
          ▼
        </a>
      </div>
    );
  }

  function cast(value: 1 | -1) {
    startTransition(async () => {
      applyVote(value);
      const formData = new FormData();
      formData.set("target", target);
      formData.set("id", id);
      formData.set("value", String(value));
      await vote(formData);
      // Pull the authoritative score (and any other votes cast meanwhile)
      // back into the page, replacing the optimistic value.
      router.refresh();
    });
  }

  return (
    <div className="inline-flex flex-col items-center gap-0.5 select-none">
      <button
        type="button"
        onClick={() => cast(1)}
        aria-label="Upvote"
        aria-pressed={upActive}
        className={`bx-btn ${upActive ? "" : "bx-btn--ghost"} ${btn}`}
        style={upActive ? { color: "var(--bx-red)" } : undefined}
      >
        ▲
      </button>
      <span
        className="font-semibold text-sm tabular-nums"
        style={
          upActive
            ? { color: "var(--bx-red)" }
            : downActive
              ? { color: "var(--bx-blue, #3b8ed0)" }
              : undefined
        }
      >
        {shown.score}
      </span>
      <button
        type="button"
        onClick={() => cast(-1)}
        aria-label="Downvote"
        aria-pressed={downActive}
        className={`bx-btn ${downActive ? "" : "bx-btn--ghost"} ${btn}`}
        style={downActive ? { color: "var(--bx-blue, #3b8ed0)" } : undefined}
      >
        ▼
      </button>
    </div>
  );
}
