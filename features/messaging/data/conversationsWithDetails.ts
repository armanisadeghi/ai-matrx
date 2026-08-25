/**
 * conversationsWithDetails.ts
 *
 * The ONE browser read for direct-message conversations, with module-scoped
 * in-flight dedup and a short TTL cache.
 *
 * Why this exists: `get_dm_conversations_with_details` is the canonical read —
 * it returns every conversation with its participants, their permitted profile
 * fields, the last message, and the unread count in a SINGLE request. Any code
 * that instead selects participants per conversation and then calls
 * `get_dm_user_info` per participant creates an N+1 fan-out; a single transport
 * hiccup then multiplies into hundreds of identical captured failures (the
 * 2026-08-21 `supabase-browser-transport-loss` storm: 909 errors in 0.6s).
 *
 * Pagination (D247): the RPC defaults to `p_limit=50` (keyset on last-message
 * time, falling back to `conversation_updated_at`, tiebroken by
 * `conversation_id`) — a page load no longer fetches every DM conversation the
 * user has ever had (505+ rows for the busiest account). `fetchConversationsWithDetails`
 * always returns page 1. `fetchMoreConversationsWithDetails` continues from a
 * cursor built with `nextConversationsCursor` off the last row of the previous
 * page — use it for "load more" / scroll-triggered pagination, never a second
 * unbounded call.
 *
 * Dedup contract (page 1 only):
 *  - Concurrent callers for the same user share ONE in-flight request. Realtime
 *    bursts across many conversations collapse instead of stampeding.
 *  - A completed response is reusable for `maxAgeMs` (default 1s). Callers that
 *    must observe a just-written row pass `maxAgeMs: 0` — they still share an
 *    in-flight request, they just never read a settled-but-stale one.
 *  - `fetchMoreConversationsWithDetails` is a one-shot, user-driven action (a
 *    "load more" click / scroll threshold) and is never cached or deduped.
 */

import type { createClient } from "@/utils/supabase/client";
import { runWithSessionRetry } from "@/lib/supabase/authRetry";

import type { DmConversationRpcRow } from "@/features/messaging/data/conversation-list";

type BrowserSupabaseClient = ReturnType<typeof createClient>;

const DEFAULT_MAX_AGE_MS = 1000;

/** Default page size for `get_dm_conversations_with_details` — must match the RPC's `p_limit` default. */
export const DM_CONVERSATIONS_PAGE_SIZE = 50;

/** Keyset cursor into the conversation list, built from the last row of the previous page. */
export interface ConversationsPageCursor {
  beforeSortAt: string;
  beforeConversationId: string;
}

/** Build the next-page cursor from the last row of a fetched page. Returns `null` when the page was short (no more rows). */
export function nextConversationsCursor(
  rows: DmConversationRpcRow[],
  pageSize: number = DM_CONVERSATIONS_PAGE_SIZE,
): ConversationsPageCursor | null {
  if (rows.length === 0 || rows.length < pageSize) return null;
  const last = rows[rows.length - 1];
  return {
    beforeSortAt: last.last_message_at ?? last.conversation_updated_at,
    beforeConversationId: last.conversation_id,
  };
}

interface CacheEntry {
  /** Shared promise while the request is in flight; cleared on settle. */
  inFlight: Promise<DmConversationRpcRow[]> | null;
  rows: DmConversationRpcRow[] | null;
  fetchedAt: number;
}

const cacheByUser = new Map<string, CacheEntry>();

function entryFor(userId: string): CacheEntry {
  const existing = cacheByUser.get(userId);
  if (existing) return existing;
  const created: CacheEntry = { inFlight: null, rows: null, fetchedAt: 0 };
  cacheByUser.set(userId, created);
  return created;
}

/** Drop any cached rows — used by tests and on sign-out. */
export function resetConversationsWithDetailsCache(): void {
  cacheByUser.clear();
}

export async function fetchConversationsWithDetails(
  supabase: BrowserSupabaseClient,
  userId: string,
  options?: { maxAgeMs?: number },
): Promise<DmConversationRpcRow[]> {
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const entry = entryFor(userId);

  if (entry.rows && Date.now() - entry.fetchedAt < maxAgeMs) {
    return entry.rows;
  }
  if (entry.inFlight) return entry.inFlight;

  const request = (async () => {
    const { data, error } = await runWithSessionRetry(() =>
      supabase.rpc("get_dm_conversations_with_details", {
        p_user_id: userId,
      }),
    );
    if (error) throw error;
    return (data ?? []) as DmConversationRpcRow[];
  })();

  entry.inFlight = request;

  try {
    const rows = await request;
    entry.rows = rows;
    entry.fetchedAt = Date.now();
    return rows;
  } finally {
    if (entry.inFlight === request) entry.inFlight = null;
  }
}

/**
 * Fetch the next page of conversations, continuing from `cursor` (built by
 * `nextConversationsCursor` off the previous page's last row). Uncached and
 * undeduped — this is a one-shot, user-driven "load more" call.
 */
export async function fetchMoreConversationsWithDetails(
  supabase: BrowserSupabaseClient,
  userId: string,
  cursor: ConversationsPageCursor,
  pageSize: number = DM_CONVERSATIONS_PAGE_SIZE,
): Promise<DmConversationRpcRow[]> {
  const { data, error } = await runWithSessionRetry(() =>
    supabase.rpc("get_dm_conversations_with_details", {
      p_user_id: userId,
      p_limit: pageSize,
      p_before_sort_at: cursor.beforeSortAt,
      p_before_conversation_id: cursor.beforeConversationId,
    }),
  );
  if (error) throw error;
  return (data ?? []) as DmConversationRpcRow[];
}
