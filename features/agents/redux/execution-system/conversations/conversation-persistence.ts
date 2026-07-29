import { supabase } from "@/utils/supabase/client";

/**
 * Canonical "is this conversation a real, deep-linkable resource yet?" check.
 *
 * `record_reserved` stream events only *announce* the server-assigned UUIDs
 * mid-turn — they do NOT imply a committed row. The backend persists the whole
 * turn (conversation + user + assistant message) atomically at stream-end, so
 * the `chat.conversation` row is often not readable until the turn finishes.
 *
 * Anything that promotes a URL to `/chat/[conversationId]` MUST gate on this
 * first. The route's SSR seed lookup (`resolveConversationSeed`) hard-redirects
 * back to `/chat/new` when it can't read the row — navigating before the row is
 * committed is the "can't leave /chat/new" bounce. Gating here ties promotion to
 * real persistence: instant when the backend commits early, deferred to turn-end
 * when it commits atomically. Either way the SSR guard always succeeds.
 *
 * The query intentionally mirrors `resolveConversationSeed` exactly (schema,
 * `deleted_at IS NULL`, and a non-null `initial_agent_id`) so a `true` here
 * guarantees the SSR guard will resolve a seed — no client/server drift.
 */
export interface WaitForConversationPersistedOptions {
  /** Abort the wait (e.g. the surface unmounted or focus moved). */
  signal?: AbortSignal;
  /**
   * Total time budget in ms before giving up. Default 180000 (3 min) — the row
   * commits at stream-end, and a long turn can stream for minutes; a miss just
   * leaves the URL un-promoted (conversation still lands in history), so being
   * patient is safe.
   */
  timeoutMs?: number;
  /** First poll delay in ms. Default 250. Backs off ×1.4, capped at `maxIntervalMs`. */
  intervalMs?: number;
  /** Backoff ceiling in ms. Default 1500 — keeps DB read volume modest on long turns. */
  maxIntervalMs?: number;
}

/** True once a row readable by `resolveConversationSeed` exists; false on abort/timeout. */
export async function waitForConversationPersisted(
  conversationId: string,
  {
    signal,
    timeoutMs = 180_000,
    intervalMs = 250,
    maxIntervalMs = 1500,
  }: WaitForConversationPersistedOptions = {},
): Promise<boolean> {
  // Guests can never read the row: the server persists their conversation
  // under a fingerprint-resolved anonymous user (aidream guest registry),
  // but this browser holds no Supabase session, so RLS hides it. Polling
  // would burn 3 minutes of reads to learn nothing — skip immediately. The
  // conversation stays live in Redux on the /new route; it surfaces in
  // history after signup promotes the anonymous user in place.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    console.info(
      `[conversation-persistence] Guest session — skipping persistence poll for ${conversationId} (URL stays on /new; server persists under the guest's anonymous user).`,
    );
    return false;
  }

  const deadline = Date.now() + timeoutMs;
  let delay = intervalMs;
  for (;;) {
    if (signal?.aborted) return false;
    const { data } = await supabase
      .schema("chat")
      .from("conversation")
      .select("initial_agent_id")
      .eq("id", conversationId)
      .is("deleted_at", null)
      .maybeSingle();
    if (data && (data.initial_agent_id as string | null)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(Math.round(delay * 1.4), maxIntervalMs);
  }
}
