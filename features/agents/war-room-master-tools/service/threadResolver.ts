/**
 * features/agents/war-room-master-tools/service/threadResolver.ts
 *
 * The ONE seam that resolves a master roster `thread_id` (= a war-room TILE id)
 * to the thread agent's durable conversation id — the same resolution
 * `masterAgentContext.ts` does when it builds the roster, extracted so the
 * master tools (read / message-fork) resolve a thread identically and from a
 * single place.
 *
 * Chain (mirrors masterAgentContext): tile → its ACTIVE 'studio_session'
 * assignment → `studio_sessions.assistant_conversation_id`. We query
 * `studio_sessions` directly (not studioService.getSession — that excludes
 * source='war_room'). Everything is owner-scoped: getTile + the assignment reads
 * + studio_sessions are all RLS-gated to the authenticated user, so a thread the
 * user can't see never resolves.
 *
 * Returns the resolved tile + (possibly null) conversationId. `conversationId`
 * is null when the thread has no audio session yet, or that session never
 * minted an assistant conversation — i.e. there is no existing chain to read or
 * fork (the "fresh" path is still valid; "fork" / "read" surface a clean
 * "no conversation yet" to the model).
 */

import { supabase } from "@/utils/supabase/client";
import { getThread } from "@/features/war-room/service";
import { listAssignmentsForContainer } from "@/features/war-room/service/associations";
import { threadRef, type WarRoomThread } from "@/features/war-room/types";

export interface ResolvedThread {
  thread: WarRoomThread;
  /** The active studio (audio) session id for the tile, or null. */
  studioSessionId: string | null;
  /** The thread agent's conversation id, or null when none exists yet. */
  conversationId: string | null;
}

/**
 * Resolve a thread (tile) by id to its agent conversation. Returns null when
 * the tile itself doesn't exist / isn't visible to the user (a hard "unknown
 * thread"). A resolved thread with `conversationId: null` means the tile exists
 * but has no agent conversation yet.
 */
export async function resolveThread(
  threadId: string,
): Promise<ResolvedThread | null> {
  const thread = await getThread(threadId);
  if (!thread) return null;

  // Active audio session for the tile (mirror of masterAgentContext: prefer the
  // flagged-active 'studio_session' assignment, else the first by position). The
  // assignment rows replace the old tile↔audio link table.
  let studioSessionId: string | null = null;
  try {
    const rows = await listAssignmentsForContainer(threadRef(threadId));
    const audio = rows.filter((r) => r.entity_type === "studio_session");
    const active = audio.find((r) => r.is_active) ?? audio[0] ?? null;
    studioSessionId = active?.entity_id ?? null;
  } catch (err) {
    console.error(
      `[war-room/master] resolveThread: audio assignments failed for ${threadId}:`,
      err,
    );
  }

  if (!studioSessionId) {
    return { thread, studioSessionId: null, conversationId: null };
  }

  // The thread agent's conversation = studio_sessions.assistant_conversation_id
  // for the active audio session.
  let conversationId: string | null = null;
  const { data, error } = await supabase
    .from("studio_sessions")
    .select("assistant_conversation_id")
    .eq("id", studioSessionId)
    .maybeSingle();
  if (error) {
    console.error(
      `[war-room/master] resolveThread: studio_sessions read failed for ${studioSessionId}:`,
      error,
    );
  } else {
    conversationId = data?.assistant_conversation_id ?? null;
  }

  return { thread, studioSessionId, conversationId };
}
