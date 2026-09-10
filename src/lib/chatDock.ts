"use client";

/**
 * Cross-component command store for the chat dock (same external-store
 * pattern as the cart): any client component can call openChat(userId) — e.g.
 * "Message Seller" on a listing — and the dock mounted in the layout reacts.
 */

import { useSyncExternalStore } from "react";

export type ChatDockState = {
  open: boolean;
  /** Active thread partner; null = conversation list. */
  otherId: string | null;
};

let state: ChatDockState = { open: false, otherId: null };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function set(next: ChatDockState) {
  state = next;
  emit();
}

export function openChat(otherId?: string) {
  set({ open: true, otherId: otherId ?? state.otherId });
}

export function minimizeChat() {
  set({ ...state, open: false });
}

export function showConversationList() {
  set({ ...state, otherId: null });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
const getSnapshot = () => state;
const SERVER_STATE: ChatDockState = { open: false, otherId: null };
const getServerSnapshot = () => SERVER_STATE;

export function useChatDock(): ChatDockState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
