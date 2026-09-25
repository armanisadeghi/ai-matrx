// features/agents/message-pins/pinned-messages-store.ts
//
// Pin / bookmark a chat message — per PERSON, stored in the platform's ONE
// per-user state store: `platform.user_entity_state` (is_pinned), entity_type
// "message" (the registered `chat.message` token), written through the
// `ues_*` chokepoint (`favoritesService`). No new table, no new column.
//
// This module is a tiny client cache over that store so every surface (the ⋯
// menu label, the pin badge, the pinned filter, the long-press sheet) reads
// one answer. PENDING, NEVER OPTIMISTIC (GATES-TAIL-2): a toggle marks the
// message pending (the badge reads "Pinning…"), and the pin appears only once
// the store agreed — a pin that claims it saved and did not is a screen that
// lies. A refusal is said in words with a remedy (toastWriteFailure).

import { useSyncExternalStore } from "react";
import { favoritesService } from "@/features/scopes/service/favoritesService";
import { toast } from "@/lib/toast";
import { toastWriteFailure } from "@/lib/errors/toastWriteFailure";

export const MESSAGE_PIN_ENTITY_TYPE = "message";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let pinned = new Set<string>();
let pending = new Set<string>();
const hydrated = new Set<string>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function setPinnedLocal(id: string, value: boolean): void {
  const next = new Set(pinned);
  if (value) next.add(id);
  else next.delete(id);
  pinned = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => pinned;
const getPendingSnapshot = () => pending;

function setPendingLocal(id: string, value: boolean): void {
  const next = new Set(pending);
  if (value) next.add(id);
  else next.delete(id);
  pending = next;
  emit();
}

/** True while a pin/unpin write for this message is in flight. */
export function isMessagePinPending(messageId: string): boolean {
  return pending.has(messageId);
}

type RpcResult<T> = { ok: true; data: T } | { ok: false; error: { message?: string } | unknown };

function isErr<T>(res: RpcResult<T>): res is { ok: false; error: unknown } {
  return !res || (res as { ok?: boolean }).ok === false;
}

export function isMessagePinned(messageId: string): boolean {
  return pinned.has(messageId);
}

/** Load pin state for these messages (skips ids already loaded). */
export async function hydratePinnedMessages(messageIds: string[]): Promise<void> {
  const ids = messageIds.filter((id) => UUID_RE.test(id) && !hydrated.has(id));
  if (ids.length === 0) return;
  for (const id of ids) hydrated.add(id);
  const res = (await favoritesService.getBulk(MESSAGE_PIN_ENTITY_TYPE, ids)) as RpcResult<{
    items: Array<{ entityId: string; isPinned: boolean }>;
  }>;
  if (isErr(res)) {
    for (const id of ids) hydrated.delete(id);
    console.error("[message-pins] could not read pinned state", res);
    return;
  }
  const next = new Set(pinned);
  for (const item of res.data.items) {
    if (item.isPinned) next.add(item.entityId);
    else next.delete(item.entityId);
  }
  pinned = next;
  emit();
}

/** Pin ↔ unpin. Resolves to the resulting pinned state. */
export async function togglePinnedMessage(messageId: string): Promise<boolean> {
  if (!UUID_RE.test(messageId)) {
    toast.error("This message isn't saved yet", {
      description: "Pin it once the reply finishes saving.",
    });
    return false;
  }
  const willPin = !pinned.has(messageId);
  // A press while the write is in flight is not a second write; the state it will land in is
  // not known yet, so it answers the current one.
  if (pending.has(messageId)) return pinned.has(messageId);
  setPendingLocal(messageId, true);
  let res: RpcResult<null>;
  try {
    res = (await favoritesService.setPinned(
      MESSAGE_PIN_ENTITY_TYPE,
      messageId,
      willPin,
    )) as RpcResult<null>;
  } catch (error) {
    res = { ok: false, error };
  } finally {
    setPendingLocal(messageId, false);
  }
  if (isErr(res)) {
    console.error("[message-pins] pin write failed", res);
    toastWriteFailure((res as { error: unknown }).error, {
      action: willPin ? "pin this message" : "unpin this message",
      remedy: "Nothing changed. Try again in a moment.",
    });
    return !willPin;
  }
  setPinnedLocal(messageId, willPin);
  return willPin;
}

/** The live set of pinned message ids (re-renders on any change). */
export function usePinnedMessageIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** The live set of message ids whose pin write is in flight. */
export function usePendingPinMessageIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getPendingSnapshot, getPendingSnapshot);
}

export function __resetPinnedMessagesForTests(): void {
  pinned = new Set();
  pending = new Set();
  hydrated.clear();
  emit();
}
