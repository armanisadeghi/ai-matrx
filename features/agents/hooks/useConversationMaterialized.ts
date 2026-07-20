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
 * Two independent signals, because neither alone covers both lifecycles:
 *   1. **Live turn** — the request status reaching `streaming` / `awaiting-tools`
 *      / `complete` means the server accepted the turn and owns the row. This is
 *      the same signal `useStudioAssistant` already gates its durable session
 *      pointer on; it fires the instant a brand-new chat becomes real.
 *   2. **Prior life** — after a reload there is no active request, so status is
 *      `undefined` even for a long-lived real conversation. One cheap row read
 *      settles it.
 *
 * Only POSITIVES are cached (module-level, page lifetime): a `false` is never
 * sticky, because a fresh id legitimately becomes real moments later via signal 1.
 * The read is one-shot and de-duplicated per id, so N components gating on the
 * same conversation cost exactly one query.
 *
 * Async, non-React callers want `waitForConversationPersisted`
 * (`@/features/agents/redux/execution-system/conversations/conversation-persistence`)
 * — the polling twin of this hook. This one is the reactive gate for render paths.
 */

import { useEffect, useSyncExternalStore } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectPrimaryRequest } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { supabase } from "@/utils/supabase/client";

/** Ids proven to have a committed `chat.conversation` row, for this page life. */
const materializedIds = new Set<string>();
/** In-flight one-shot reads, so concurrent gates on one id share a single query. */
const inFlightReads = new Map<string, Promise<boolean>>();

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
 * A request status that means the SERVER has taken ownership of the turn — at
 * which point the `chat.conversation` row is committed (or committing) and the
 * id is safe to persist. Mirrors `useStudioAssistant`'s durable-write gate.
 */
function isServerConfirmedStatus(status: string | undefined): boolean {
  return (
    status === "streaming" ||
    status === "awaiting-tools" ||
    status === "complete"
  );
}

/**
 * One-shot existence read, de-duplicated per id. Mirrors
 * `waitForConversationPersisted`'s query exactly (schema, `deleted_at IS NULL`,
 * non-null `initial_agent_id`) so the two gates can never disagree about
 * whether a given conversation is real.
 */
export async function readConversationMaterialized(
  conversationId: string,
): Promise<boolean> {
  if (materializedIds.has(conversationId)) return true;
  const existing = inFlightReads.get(conversationId);
  if (existing) return existing;

  const read = (async () => {
    const { data, error } = await supabase
      .schema("chat")
      .from("conversation")
      .select("initial_agent_id")
      .eq("id", conversationId)
      .is("deleted_at", null)
      .maybeSingle();
    // A read FAILURE is not evidence of absence — stay "unknown" so the caller
    // withholds the durable write rather than acting on a network blip.
    if (error) return false;
    const exists = Boolean(data && (data.initial_agent_id as string | null));
    if (exists) markMaterialized(conversationId);
    return exists;
  })().finally(() => {
    inFlightReads.delete(conversationId);
  });

  inFlightReads.set(conversationId, read);
  return read;
}

/**
 * True once `conversationId` is known to have a committed server row. Gate every
 * durable write of a conversation id on this.
 */
export function useConversationMaterialized(
  conversationId: string | null | undefined,
): boolean {
  const status = useAppSelector((s) =>
    conversationId ? selectPrimaryRequest(conversationId)(s)?.status : undefined,
  );
  const confirmedByTurn = isServerConfirmedStatus(status);

  // Subscribed, not copied into state: whichever gate proves the id first wakes
  // every other gate watching it, so none can strand on a stale `false`.
  const confirmedByCache = useSyncExternalStore(
    subscribeToCache,
    () => (conversationId ? materializedIds.has(conversationId) : false),
    () => false,
  );

  useEffect(() => {
    if (!conversationId || materializedIds.has(conversationId)) return;
    // The live turn already proves it — record it and skip the read entirely.
    if (confirmedByTurn) {
      markMaterialized(conversationId);
      return;
    }
    void readConversationMaterialized(conversationId);
  }, [conversationId, confirmedByTurn]);

  return confirmedByTurn || confirmedByCache;
}
