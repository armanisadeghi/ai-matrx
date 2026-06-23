// features/war-room/redux/warRoom.types.ts
//
// Slice state shape for the warRoom reducer. War Room stores ONLY linkage +
// tile UI state; task/note/transcript data live in their own slices.

import type {
  TileTab,
  WarRoomAssignment,
  WarRoomSession,
  WarRoomTile,
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

  /**
   * Polymorphic associations, keyed by `containerKey(type, id)` — i.e.
   * "thread:<tileId>" or "room:<sessionId>". ONE bucket per container holds every
   * resource it's linked to (task, project, note, studio_session, file, document,
   * conversation). Replaces the old per-type maps (audio/note/attachment) and the
   * tile FK columns. All per-type selectors derive from this single source.
   */
  assignmentsByContainer: Record<string, WarRoomAssignment[]>;

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
  assignmentsByContainer: {},
  autoApproveByTile: {},
};

export type { TileTab };
