"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * A dashboard row with a trashcan that removes it via a server action —
 * used by the listing manager (soft-delete a listing) and the buyer's
 * "Offers I've sent" list (clear a finished offer).
 *
 * Confirms first (a stray tap shouldn't remove anything), then calls the
 * action and hides the row optimistically on success. router.refresh()
 * still runs to reconcile everything derived from the row server-side
 * (tiles, section headers), but the row itself never waits on it: on a
 * large dashboard the refresh payload can land a cycle late, and the
 * user's own delete must be visible immediately. Authorization and which
 * rows may be removed are enforced in the action, server-side.
 */
export function RemovableRow({
  action,
  fieldName,
  fieldValue,
  confirmMessage,
  ariaLabel,
  errorFallback,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<{ ok: boolean; error?: string }>;
  /** FormData field carrying the row's id, e.g. "listingId" / "offerId". */
  fieldName: string;
  fieldValue: string;
  confirmMessage: string;
  ariaLabel: string;
  errorFallback: string;
  className: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [gone, setGone] = useState(false);
  const [err, setErr] = useState("");

  if (gone) return null;

  function onRemove() {
    if (!window.confirm(confirmMessage)) return;
    setErr("");
    startTransition(async () => {
      const fd = new FormData();
      fd.append(fieldName, fieldValue);
      const res = await action(fd);
      if (!res.ok) {
        setErr(res.error ?? errorFallback);
        return;
      }
      setGone(true);
      router.refresh();
    });
  }

  return (
    <div className={className}>
      {children}
      <span className="shrink-0 inline-flex flex-col items-end">
        <button
          type="button"
          onClick={onRemove}
          disabled={pending}
          aria-label={ariaLabel}
          title={ariaLabel}
          className="rounded-full border-2 border-[var(--bx-ink)] bg-white p-1.5 text-[var(--bx-ink)] shadow-[0_2px_0_var(--bx-ink)] hover:-translate-y-0.5 hover:!text-[var(--bx-red)] transition-transform disabled:opacity-50 disabled:translate-y-0"
        >
          {pending ? (
            <span className="block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <TrashIcon />
          )}
        </button>
        {err && (
          <span className="mt-1 text-[10px] text-red-600 max-w-28 text-right">
            {err}
          </span>
        )}
      </span>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
