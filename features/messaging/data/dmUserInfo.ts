/**
 * dmUserInfo.ts
 *
 * The ONE browser reader for `get_dm_user_info`, with module-scoped in-flight
 * dedup and a TTL cache.
 *
 * A DM profile (display name, avatar, email) is near-static, but the surfaces
 * that need it are the opposite: every incoming message, every page of
 * history, every conversation refresh asks for the same handful of user ids
 * again and again. Unshared, that is an N+1 per surface — and when the network
 * blips, each of those calls becomes its own captured failure (the 2026-08-21
 * `supabase-browser-transport-loss` storm: 909 errors in 0.6s).
 *
 * Prefer `get_dm_conversations_with_details`, which already returns
 * participants with their permitted profile fields, whenever the caller wants
 * conversation data. This reader is for the cases that genuinely start from a
 * bare user id (a message sender).
 */

import type { UserBasicInfo } from "@/features/messaging/types";
import type { createClient } from "@/utils/supabase/client";

type BrowserSupabaseClient = ReturnType<typeof createClient>;

/** Profiles change rarely; a realtime burst must never re-ask per message. */
const USER_INFO_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  inFlight: Promise<UserBasicInfo | null> | null;
  value: UserBasicInfo | null;
  fetchedAt: number;
}

const cacheByUserId = new Map<string, CacheEntry>();

/** Drop cached profiles — used by tests and on sign-out. */
export function resetDmUserInfoCache(): void {
  cacheByUserId.clear();
}

export function fetchDmUserInfo(
  supabase: BrowserSupabaseClient,
  userId: string,
): Promise<UserBasicInfo | null> {
  const existing = cacheByUserId.get(userId);
  if (existing) {
    if (existing.inFlight) return existing.inFlight;
    if (Date.now() - existing.fetchedAt < USER_INFO_TTL_MS) {
      return Promise.resolve(existing.value);
    }
  }

  const entry: CacheEntry = existing ?? {
    inFlight: null,
    value: null,
    fetchedAt: 0,
  };
  cacheByUserId.set(userId, entry);

  const request = (async () => {
    const { data, error } = await supabase.rpc("get_dm_user_info", {
      p_user_id: userId,
    });
    // A guarded miss (no row) is a legitimate answer — cache it too, so a
    // stranger's id cannot re-ask on every single message.
    if (error) throw error;
    return data?.[0] ?? null;
  })();

  entry.inFlight = request;

  return request
    .then((value) => {
      entry.value = value;
      entry.fetchedAt = Date.now();
      return value;
    })
    .finally(() => {
      if (entry.inFlight === request) entry.inFlight = null;
    });
}

/** Resolve many ids at once; identical ids collapse to a single request. */
export async function fetchDmUserInfoMap(
  supabase: BrowserSupabaseClient,
  userIds: readonly string[],
): Promise<Map<string, UserBasicInfo>> {
  const unique = [...new Set(userIds)];
  const resolved = await Promise.all(
    unique.map((id) =>
      fetchDmUserInfo(supabase, id).catch(() => null),
    ),
  );

  const map = new Map<string, UserBasicInfo>();
  unique.forEach((id, index) => {
    const info = resolved[index];
    if (info) map.set(id, info);
  });
  return map;
}
