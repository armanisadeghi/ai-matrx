/**
 * features/war-room/service/warRoomRecentActivity.ts
 *
 * Client reader for the `war_room_recent_activity` RPC — the computed
 * recent-activity feed for a War Room (latest touch per associated entity:
 * chat messages, note edits, audio, task/project/file updates, resource
 * attaches), newest first. See migrations/war_room_recent_activity_rpc.sql.
 *
 * Reached DIRECT via supabase-js (the RPC is SECURITY DEFINER, gated by
 * iam.has_access('war_room', …)) — no Python hop. Callers: the room/master
 * agent-context builders, which enrich each row's thread label from their own
 * resolved roster and pass the result to the `war_room` XML `<recent>` block.
 */

import { supabase } from "@/utils/supabase/client";
import type { WarRoomActivityEvent } from "@/features/war-room/service/warRoomContextXml";
import { formatRelativeTime } from "@ai-matrx/kit/format";

/** One raw row from the RPC (mirrors its RETURNS TABLE shape). */
export interface WarRoomActivityRow {
  occurred_at: string;
  thread_id: string | null;
  thread_title: string | null;
  entity_type: string;
  entity_id: string;
  label: string | null;
  action: string;
  actor_id: string | null;
  detail: string | null;
}

/** Fetch the recent-activity rows for a room (newest first). Loud on error, but
 *  never throws — activity is a context enhancement, never load-bearing. */
export async function fetchWarRoomRecentActivity(
  warRoomId: string,
  limit = 25,
): Promise<WarRoomActivityRow[]> {
  const { data, error } = await supabase.rpc("war_room_recent_activity", {
    p_war_room_id: warRoomId,
    p_limit: limit,
  });
  if (error) {
    console.error(
      `[war-room/activity] war_room_recent_activity RPC failed for ${warRoomId}:`,
      error,
    );
    return [];
  }
  return (data ?? []) as WarRoomActivityRow[];
}

/**
 * Compact relative-age label for an ISO timestamp vs `nowMs` — the fleet's one
 * `short` relative voice from `@ai-matrx/kit/format` ("5m ago", "3h ago").
 */
export function relativeWhen(iso: string, nowMs: number): string {
  return formatRelativeTime(iso, { now: nowMs, fallback: "" });
}

/** Human-friendly action verb for the `<event action>` attribute. */
const ACTION_LABEL: Record<string, string> = {
  chat_message: "chatted",
  note_edited: "edited note",
  audio_activity: "recorded audio",
  task_updated: "updated task",
  project_updated: "updated project",
  file_updated: "updated file",
  attached: "attached",
  thread_updated: "renamed thread",
  room_updated: "renamed room",
};

/**
 * Map raw RPC rows → the renderer's `WarRoomActivityEvent[]`. `threadTitleById`
 * lets the builder override the RPC's best-effort thread label with the one it
 * already resolved (threads usually have no title column — see the RPC). `nowMs`
 * is passed in (never `Date.now()` at import) so callers control the clock.
 */
export function toActivityEvents(
  rows: WarRoomActivityRow[],
  threadTitleById: Map<string, string>,
  nowMs: number,
): WarRoomActivityEvent[] {
  return rows.map((r) => {
    const resolved =
      (r.thread_id ? threadTitleById.get(r.thread_id) : undefined) ??
      (r.thread_title && r.thread_title !== "Thread"
        ? r.thread_title
        : undefined);
    return {
      when: relativeWhen(r.occurred_at, nowMs),
      threadTitle: resolved,
      entityType: r.entity_type,
      action: ACTION_LABEL[r.action] ?? r.action,
      label: r.label ?? undefined,
      detail: r.detail ?? undefined,
    };
  });
}
