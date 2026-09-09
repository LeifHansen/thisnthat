"use client";

import { useCallback, useSyncExternalStore } from "react";

// A cart item is a lightweight display snapshot. The listingId is the only
// source of truth — price, availability and fees are always re-resolved
// server-side at checkout (see /api/checkout), so a stale snapshot can never
// change what a buyer actually pays.
export type CartItem = {
  listingId: string;
  title: string;
  priceCents: number;
  photo: string | null;
  sellerId: string;
};

const STORAGE_KEY = "bx-cart-v1";
const EMPTY: CartItem[] = [];

// ── Module-level external store ──────────────────────────────────────
// Backed by localStorage and shared across every component + browser tab.
// Read through useSyncExternalStore so SSR renders an empty cart and the
// client reconciles after mount (no hydration mismatch, no setState-in-effect).
let cart: CartItem[] = EMPTY;
let initialized = false;
const listeners = new Set<() => void>();

function readStorage(): CartItem[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const items = parsed.filter(
      (i): i is CartItem => !!i && typeof (i as CartItem).listingId === "string",
    );
    return items.length ? items : EMPTY;
  } catch {
    return EMPTY;
  }
}

function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  cart = readStorage();
}

function emit() {
  listeners.forEach((l) => l());
}

function setCart(next: CartItem[]) {
  cart = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage full / unavailable — cart just won't persist
  }
  emit();
}

function subscribe(onChange: () => void) {
  ensureInit();
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cart = readStorage();
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot() {
  return cart;
}
function getServerSnapshot() {
  return EMPTY;
}
function getInitialized() {
  return initialized;
}
function getInitializedServer() {
  return false;
}

/** Pass-through provider kept so the layout's <CartProvider> stays valid. */
export function CartProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useCart() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // True once localStorage has been read on the client (avoids a flash of the
  // "empty cart" state before hydration).
  const ready = useSyncExternalStore(
    subscribe,
    getInitialized,
    getInitializedServer,
  );

  const add = useCallback((item: CartItem) => {
    if (cart.some((p) => p.listingId === item.listingId)) return;
    // Server-side checkout caps a cart at 20 items — enforce it here so the
    // buyer finds out at add time, not after entering their card.
    if (cart.length >= 20) return;
    setCart([...cart, item]);
  }, []);
  const remove = useCallback((listingId: string) => {
    setCart(cart.filter((p) => p.listingId !== listingId));
  }, []);
  const clear = useCallback(() => setCart([]), []);
  const has = useCallback(
    (listingId: string) => items.some((p) => p.listingId === listingId),
    [items],
  );

  return { items, count: items.length, ready, has, add, remove, clear };
}
