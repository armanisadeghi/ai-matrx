"use client";

/**
 * THE IN-PLACE CHAT HOST — how the ONE chat menu (`ChatSidebarMenu`, the shell
 * sidebar's "Chats" side) works on a page that carries its own chat panel.
 *
 * On /chat a history row is a route: it navigates to /chat/<id>. On a page
 * that hosts the chat beside its own content (the Board's canvas workspace,
 * signed-in Education) that would throw the person off the page, so the page
 * registers itself here while it is mounted, and the same menu opens the
 * conversation IN the page's chat panel, starts a new chat there, and lights
 * the conversation the panel is showing. One menu, two hosts — never a second
 * history sidebar.
 *
 * A module store (not React context) because the sidebar and the page are
 * siblings under the shell: no context reaches from `<main>` into the sidebar.
 */

import { useSyncExternalStore } from "react";

export interface InPlaceChatHost {
  /** The conversation the page's chat panel is showing. */
  activeConversationId: string | null;
  /** Open a conversation from the history list in the page's chat panel. */
  openConversation: (conversation: { conversationId: string; agentId?: string | null }) => void;
  /** Start a fresh chat in the page's chat panel. */
  startNewChat: () => void;
  /** Start a chat with this agent in the page's chat panel (a pinned / searched agent). */
  startWithAgent: (agentId: string) => void;
}

// A stack, so a host mounted over another (and released first) hands the menu
// back to the one underneath instead of to nobody.
let hosts: InPlaceChatHost[] = [];
let current: InPlaceChatHost | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Register the page's chat panel as the host. Returns the release; the most recent live registration wins. */
export function registerInPlaceChatHost(host: InPlaceChatHost): () => void {
  hosts = [...hosts, host];
  current = host;
  emit();
  return () => {
    hosts = hosts.filter((h) => h !== host);
    const next = hosts[hosts.length - 1] ?? null;
    if (next === current) return;
    current = next;
    emit();
  };
}

/** The current host, outside React (tests, event handlers). */
export function currentInPlaceChatHost(): InPlaceChatHost | null {
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The registered host, or null on an ordinary page (history rows navigate). */
export function useInPlaceChatHost(): InPlaceChatHost | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
