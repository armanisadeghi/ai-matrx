// features/war-room/utils/threadDisplayTitle.ts
//
// One place for the human-readable thread label used in search hits, rails, etc.

import type { WarRoomTile } from "@/features/war-room/types";

export const UNTITLED_THREAD_LABEL = "Untitled thread";

/** The thread title shown in UI — never empty. */
export function threadDisplayTitle(
  tile: Pick<WarRoomTile, "title"> | null | undefined,
  fallbackTaskTitle?: string | null,
): string {
  const own = tile?.title?.trim();
  if (own) return own;
  const task = fallbackTaskTitle?.trim();
  if (task) return task;
  return UNTITLED_THREAD_LABEL;
}
