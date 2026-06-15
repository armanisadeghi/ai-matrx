// features/war-room/redux/warRoom.types.ts
//
// Slice state shape for the warRoom reducer. War Room stores ONLY linkage +
// tile UI state; task/note/transcript data live in their own slices.

import type { TileTab, WarRoomSession, WarRoomTile } from "../types";

export type LoadStatus = "idle" | "loading" | "ready" | "error";

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

  // Note links (tile → note ids)
  noteIdsByTile: Record<string, string[]>;
  activeNoteByTile: Record<string, string | null>;
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
  noteIdsByTile: {},
  activeNoteByTile: {},
};

export type { TileTab };
