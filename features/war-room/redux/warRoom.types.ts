// features/war-room/redux/warRoom.types.ts
//
// Slice state shape for the warRoom reducer. War Room stores ONLY linkage +
// tile UI state; task/note/transcript data live in their own slices.

import type { TileTab, WarRoomSession, WarRoomTile } from "../types";

export type LoadStatus = "idle" | "loading" | "ready" | "error";
export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Per-mount ephemeral UI that never round-trips to Supabase. */
export interface WarRoomUiState {
  focusedTileId: string | null;
  /** Draft text captured in the always-present "new" tile before it's promoted. */
  newTileDraft: { taskName?: string; noteText?: string } | null;
  /** Which tile currently has its context-override popover open. */
  contextOverrideOpenTileId: string | null;
}

export interface WarRoomState {
  // Session registry
  sessionsById: Record<string, WarRoomSession>;
  sessionIds: string[];
  activeSessionId: string | null;
  listStatus: LoadStatus;
  listError: string | null;

  // Tiles for loaded sessions
  tilesById: Record<string, WarRoomTile>;
  tileIdsBySession: Record<string, string[]>;
  /** Load status of a session's tiles, keyed by sessionId. */
  tilesStatusBySession: Record<string, LoadStatus>;

  // Audio links (tile → studio_session ids)
  audioSessionIdsByTile: Record<string, string[]>;
  activeAudioSessionByTile: Record<string, string | null>;

  // Per-tile save state (optimistic write feedback)
  tileSaveState: Record<string, SaveStatus>;

  ui: WarRoomUiState;
}

export const initialWarRoomState: WarRoomState = {
  sessionsById: {},
  sessionIds: [],
  activeSessionId: null,
  listStatus: "idle",
  listError: null,
  tilesById: {},
  tileIdsBySession: {},
  tilesStatusBySession: {},
  audioSessionIdsByTile: {},
  activeAudioSessionByTile: {},
  tileSaveState: {},
  ui: {
    focusedTileId: null,
    newTileDraft: null,
    contextOverrideOpenTileId: null,
  },
};

export type { TileTab };
