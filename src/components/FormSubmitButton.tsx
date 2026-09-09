"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button that disables itself (and swaps its label) while the parent
 * form's server action is in flight, so a double-click can't fire the action
 * twice — accepted offers create orders and reserve stock, so a duplicate
 * submit has real cost.
 */
export function FormSubmitButton({
  children,
  pendingLabel = "Working…",
  className = "bx-btn",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
