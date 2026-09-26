// features/agents/components/messages-display/conversation-tools/conversation-view-state.ts
//
// Per-conversation VIEW state for the answer tools — is the in-thread find bar
// open, is the transcript filtered to pinned messages — shared by the
// transcript (which renders the find bar and applies the filter) and whatever
// chrome the host already has (the /chat header's conversation menu drives
// both). One tiny module store keyed by conversation id, so the header and the
// transcript never need a common React parent and no new row of chrome is
// drawn on the transcript to hold these controls.
//
// Ephemeral by design: a view choice, not a record — nothing is persisted.

import { useSyncExternalStore } from "react";

export interface ConversationViewState {
  findOpen: boolean;
  pinnedOnly: boolean;
}

const CLOSED: ConversationViewState = Object.freeze({
  findOpen: false,
  pinnedOnly: false,
});

let states = new Map<string, ConversationViewState>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function patch(conversationId: string, next: Partial<ConversationViewState>): void {
  const prev = states.get(conversationId) ?? CLOSED;
  const merged = { ...prev, ...next };
  if (merged.findOpen === prev.findOpen && merged.pinnedOnly === prev.pinnedOnly) return;
  states = new Map(states);
  states.set(conversationId, merged);
  for (const l of listeners) l();
}

export function getConversationViewState(conversationId: string): ConversationViewState {
  return states.get(conversationId) ?? CLOSED;
}

export function useConversationViewState(conversationId: string): ConversationViewState {
  const get = () => getConversationViewState(conversationId);
  return useSyncExternalStore(subscribe, get, get);
}

export function setConversationFindOpen(conversationId: string, open: boolean): void {
  patch(conversationId, { findOpen: open });
}

export function setConversationPinnedOnly(conversationId: string, on: boolean): void {
  patch(conversationId, { pinnedOnly: on });
}

export function __resetConversationViewStateForTests(): void {
  states = new Map();
  for (const l of listeners) l();
}
