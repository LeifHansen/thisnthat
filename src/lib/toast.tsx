"use client";

/**
 * Sitewide toast notifications. Same shape as the cart store: a module-level
 * external store read via useSyncExternalStore, so any client component can
 * fire `toast.success("…")` without a context provider. <Toaster /> (mounted
 * once in the root layout) renders the stack bottom-center above everything
 * (z-[110] clears the SignupPrompt modal at z-[100]).
 */

import { useEffect, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type ToastKind = "success" | "error" | "info";
export type Toast = { id: number; kind: ToastKind; message: string };

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function push(kind: ToastKind, message: string) {
  const id = nextId++;
  toasts = [...toasts, { id, kind, message }].slice(-4);
  emit();
  setTimeout(() => dismiss(id), 4500);
}

function dismiss(id: number) {
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
  info: (message: string) => push("info", message),
};

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
const getSnapshot = () => toasts;
const EMPTY: Toast[] = [];
const getServerSnapshot = () => EMPTY;

const KIND_STYLE: Record<ToastKind, { bg: string; icon: string }> = {
  success: { bg: "var(--bx-green)", icon: "✓" },
  error: { bg: "var(--bx-red)", icon: "!" },
  info: { bg: "var(--bx-blue)", icon: "i" },
};

export function Toaster() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (items.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="fixed inset-x-0 bottom-4 z-[110] flex flex-col items-center gap-2 px-4 pointer-events-none"
    >
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className="pointer-events-auto flex items-center gap-2.5 max-w-md w-fit rounded-full border-2 border-[var(--bx-ink)] bg-white px-4 py-2.5 text-sm font-semibold !text-ink shadow-[0_3px_0_var(--bx-ink)] bx-toast-in"
        >
          <span
            aria-hidden
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
            style={{ background: KIND_STYLE[t.kind].bg }}
          >
            {KIND_STYLE[t.kind].icon}
          </span>
          <span className="text-left">{t.message}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Bridges server-action redirects into toasts: any redirect that appends
 * ?toast=…&toastKind=… fires a toast on arrival, then strips the params so
 * refresh/back doesn't re-fire. Mounted once in the layout inside Suspense
 * (useSearchParams requirement).
 */
export function ToastFromQuery() {
  const params = useSearchParams();
  const router = useRouter();
  const message = params.get("toast");
  const kind = params.get("toastKind");

  useEffect(() => {
    if (!message) return;
    push(kind === "error" ? "error" : kind === "info" ? "info" : "success", message);
    const next = new URLSearchParams(params);
    next.delete("toast");
    next.delete("toastKind");
    const q = next.toString();
    router.replace(q ? `?${q}` : window.location.pathname, { scroll: false });
  }, [message, kind, params, router]);

  return null;
}
