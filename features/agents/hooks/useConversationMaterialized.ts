"use client";

/**
 * useConversationMaterialized — "does this conversation actually EXIST server-side?"
 *
 * A conversation id is minted CLIENT-SIDE (`generateConversationId`) and stays a
 * pure in-memory placeholder until the backend commits the row at the end of the
 * FIRST streamed turn. Anything that writes that id into a DURABLE record —
 * an association edge, a session pointer, a stored reference — before the row
 * exists creates a dangling pointer that survives forever and can never
 * self-heal (the phantom War Room chat class: a provisioned chat the user never
 * sent into, left behind as a permanent ghost row in every chat list).
 *
 * THE RULE: never persist a conversation id anywhere durable until this gate
 * returns true.
 *
 * There is exactly one truthful signal: a readable `chat.conversation` row.
 * Stream lifecycle events such as `record_reserved`, `streaming`, and
 * `awaiting-tools` arrive before the backend's atomic turn commit, so treating
 * them as persistence confirmation races durable readers and writes.
 *
 * Only POSITIVES are cached (module-level, page lifetime): a `false` is never
 * sticky, because a fresh id legitimately becomes real moments later. With no
 * live request the hook performs one existence read. Once streaming starts it
 * polls through the existing persistence waiter until the row is readable or
 * the watching component unmounts. Stream status starts the wait; it never
 * proves persistence by itself.
 *
 * Async, non-React callers want `waitForConversationPersisted`
 * (`@/features/agents/redux/execution-system/conversations/conversation-persistence`)
 * — the polling twin of this hook. This one is the reactive gate for render paths.
 */

import { useEffect, useSyncExternalStore } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectPrimaryRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { waitForConversationPersisted } from "@/features/agents/redux/execution-system/conversations/conversation-persistence";

/** Ids proven to have a committed `chat.conversation` row, for this page life. */
const materializedIds = new Set<string>();

/**
 * The cache is a tiny external store rather than per-hook state, because SEVERAL
 * gates commonly watch the same conversation (a thread panel and the room panel
 * both mounted). With per-hook state, whichever component happened to resolve
 * the id first would leave the others stranded on a stale `false` with nothing
 * left to schedule their re-render. `useSyncExternalStore` makes every gate
 * flip together the moment the id is proven real.
 */
const cacheListeners = new Set<() => void>();

function subscribeToCache(onChange: () => void): () => void {
  cacheListeners.add(onChange);
  return () => {
    cacheListeners.delete(onChange);
  };
}

/** Record an id as real and wake every gate watching it. Idempotent. */
function markMaterialized(conversationId: string): void {
  if (materializedIds.has(conversationId)) return;
  materializedIds.add(conversationId);
  for (const listener of cacheListeners) listener();
}

/**
 * True once `conversationId` is known to have a committed server row. Gate every
 * durable write of a conversation id on this.
 */
export function useConversationMaterialized(
  conversationId: string | null | undefined,
): boolean {
  const status = useAppSelector((state) =>
    conversationId ? selectPrimaryRequest(conversationId)(state)?.status : undefined,
  );
  const shouldPoll =
    status === "streaming" ||
    status === "awaiting-tools" ||
    status === "complete";

  // Subscribed, not copied into state: whichever gate proves the id first wakes
  // every other gate watching it, so none can strand on a stale `false`.
  const confirmedByCache = useSyncExternalStore(
    subscribeToCache,
    () => (conversationId ? materializedIds.has(conversationId) : false),
    () => false,
  );

  useEffect(() => {
    if (!conversationId || materializedIds.has(conversationId)) return;
    const controller = new AbortController();
    void waitForConversationPersisted(conversationId, {
      signal: controller.signal,
      // Existing/reloaded conversations need one cheap proof read. A live
      // stream keeps waiting because its first atomic commit is still pending.
      timeoutMs: shouldPoll ? undefined : 0,
    }).then((persisted) => {
      if (persisted) markMaterialized(conversationId);
    });
    return () => controller.abort();
  }, [conversationId, shouldPoll]);

  return confirmedByCache;
}
