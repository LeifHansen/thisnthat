"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createPost, type ReplyState } from "@/lib/forum";

const INITIAL: ReplyState = { ok: false };

/**
 * Reply box on a thread page. Client-side so a posted reply actually shows
 * up: we refresh the router once the action resolves, clear the textarea,
 * and surface validation errors (locked thread, empty body) instead of
 * silently doing nothing. Posting used to leave the reply invisible and the
 * box full, so people posted the same reply several times over.
 */
export function ReplyForm({ threadId }: { threadId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(createPost, INITIAL);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction} className="bx-panel p-4 space-y-3">
      <input type="hidden" name="threadId" value={threadId} />
      <label className="block space-y-1">
        <span className="text-sm text-ink">Reply</span>
        <textarea
          name="body"
          required
          rows={4}
          maxLength={8000}
          disabled={pending}
          className="bx-input"
          placeholder="Be helpful. Down-votes follow lazy answers."
        />
      </label>
      {state.error && <p className="text-pink text-sm">{state.error}</p>}
      <button className="bx-btn" type="submit" disabled={pending}>
        {pending ? "Posting…" : "Post reply"}
      </button>
    </form>
  );
}
