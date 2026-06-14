// features/war-room/constants.ts

import type { TileTab } from "./types";

/** studio_sessions.source value for transcript sessions owned by a War Room tile. */
export const WAR_ROOM_AUDIO_SOURCE = "war_room";

/** Sentinel id for the always-present "new" tile (never persisted as a row). */
export const NEW_TILE_ID = "__war_room_new_tile__";

export const DEFAULT_SESSION_TITLE = "New War Room";

export const TILE_TABS: { id: TileTab; label: string }[] = [
  { id: "task", label: "Task" },
  { id: "notes", label: "Notes" },
  { id: "audio", label: "Audio" },
  { id: "combined", label: "All" },
];

/** Default tab when a tile has a task (the anchor); falls back to notes when not. */
export const DEFAULT_TILE_TAB: TileTab = "task";

// ── Gallery layout tuning (consumed by the generic engine in Wave 2) ───
export const GALLERY_GAP_PX = 12;
export const GALLERY_MIN_TILE = { width: 300, height: 220 };
export const GALLERY_TARGET_ASPECT = 4 / 3;
