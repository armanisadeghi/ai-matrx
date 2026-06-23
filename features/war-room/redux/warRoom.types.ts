// features/war-room/redux/warRoom.types.ts
//
// Slice state shape for the warRoom reducer. War Room stores ONLY linkage +
// tile UI state; task/note/transcript data live in their own slices.

import type {
  TileTab,
  WarRoomSession,
  WarRoomTile,
  WarRoomTileAttachment,
} from "../types";

export type LoadStatus = "idle" | "loading" | "ready" | "error";

/**
 * Classes of agent edit the user can choose to "always approve" on a tile, so
 * the HITL approval card stops asking. Subtasks roll up under "task". Stored
 * per-tile (in-memory, session-scoped) so trust never silently outlives the
 * session — see `autoApproveByTile`.
 */
export type AutoApproveScope = "task" | "note" | "tile";

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

  // File / document attachment links (tile → attachment rows)
  attachmentsByTile: Record<string, WarRoomTileAttachment[]>;

  /**
   * Auto-approve grants for agent tile edits: tileId → { scope → true }. When a
   * scope is set, the war-room dispatcher runs that class of edit without the
   * approval card (firing a loud, revocable toast instead). In-memory only —
   * intentionally NOT persisted, so a reload always re-requires the grant.
   */
  autoApproveByTile: Record<string, Record<string, boolean>>;
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
  attachmentsByTile: {},
  autoApproveByTile: {},
};

export type { TileTab };
