"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ListingStatus } from "@prisma/client";
import { removeListing, restoreListing } from "../actions";

/**
 * Moderation buttons for one row of the admin listings table. Remove pulls a
 * live/draft/sold listing (soft delete → REMOVED); Restore puts a removed one
 * back on sale. Both confirm first, run in a transition, and refresh the
 * table on success — the actions return an error string instead of
 * redirecting so it can be shown right on the row.
 */
export function ListingRowActions({
  id,
  title,
  status,
}: {
  id: string;
  title: string;
  status: ListingStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState("");

  function run(
    action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>,
    confirmMessage: string,
  ) {
    if (!window.confirm(confirmMessage)) return;
    setErr("");
    startTransition(async () => {
      const fd = new FormData();
      fd.append("listingId", id);
      const res = await action(fd);
      if (!res.ok) {
        setErr(res.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {status === "REMOVED" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              restoreListing,
              `Put "${title}" back on sale? It will show in Browse again immediately.`,
            )
          }
          className="tnt-btn tnt-btn--green !py-1 !px-2.5 !text-xs whitespace-nowrap disabled:opacity-50"
        >
          {pending ? "Restoring…" : "Restore"}
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              removeListing,
              `Remove "${title}" from the marketplace? Existing orders and offers are kept; the seller can't re-list it from their dashboard.`,
            )
          }
          className="tnt-btn !py-1 !px-2.5 !text-xs !bg-[var(--tnt-red)] !text-white whitespace-nowrap disabled:opacity-50"
        >
          {pending ? "Removing…" : "Remove"}
        </button>
      )}
      {err && (
        <span className="text-[10px] text-red-600 max-w-40 text-right">{err}</span>
      )}
    </div>
  );
}
