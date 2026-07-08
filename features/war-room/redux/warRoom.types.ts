// features/war-room/redux/warRoom.types.ts
//
// Slice state shape for the warRoom reducer.

import type {
  ThreadTab,
  ThreadUserState,
  WarRoomAssignment,
  WarRoomSession,
  WarRoomThread,
} from "../types";

export type LoadStatus = "idle" | "loading" | "ready" | "error";

export type AutoApproveScope = "task" | "note" | "thread";

/**
 * The room-level audio recording in flight (at most one, app-wide — the
 * GlobalRecordingProvider enforces a single recorder). Owned by the
 * RoomRecordingController mounted at the room shell, NOT by the tile's
 * CleanupPad view — so switching a tile's tab (which unmounts the pad) never
 * tears the recording session down. `status` moves recording → finalizing on
 * stop; the entry clears when the transcript finalizes (or errors).
 */
export interface WarRoomAudioRecording {
  threadId: string;
  /** The tile's `studio_sessions` row being recorded into. */
  sessionId: string;
  status: "recording" | "finalizing";
}

export interface WarRoomState {
  sessionsById: Record<string, WarRoomSession>;
  sessionIds: string[];
  activeSessionId: string | null;
  listStatus: LoadStatus;
  listError: string | null;

  threadsById: Record<string, WarRoomThread>;
  /** Thread ids per room — from `war_room_threads()` RPC. */
  threadIdsByRoom: Record<string, string[]>;
  /** Orphan thread ids (no room membership). */
  orphanThreadIds: string[];
  threadsStatusByRoom: Record<string, LoadStatus>;

  /** Per-user pin/hide from `user_entity_state` — keyed by thread id. */
  threadUserStateById: Record<string, ThreadUserState>;

  assignmentsByContainer: Record<string, WarRoomAssignment[]>;
  /**
   * Which `containerKey()` buckets have actually been hydrated from the
   * server at least once. `assignmentsByContainer[key]` being `undefined`
   * is indistinguishable from "loaded, but empty" without this — and that
   * ambiguity is exactly what caused ensure-thunks (e.g. `ensureThreadNote`)
   * to see "no active note yet" on a not-yet-loaded thread and create a
   * duplicate. Never infer "loaded" from bucket presence — always check here.
   */
  assignmentsLoadedKeys: Record<string, true>;

  /**
   * The thread agent's conversation id per thread
   * (`studio_sessions.assistant_conversation_id` of the ACTIVE audio session),
   * hydrated in `loadWarRoomSession` so the SYNC Tier-1 context builder can
   * stamp sibling rows with `conversation=` (cross-agent reads).
   */
  agentConversationByThread: Record<string, string | null>;

  autoApproveByThread: Record<string, Record<string, boolean>>;

  /** Room-level recording ownership — see WarRoomAudioRecording. */
  audioRecording: WarRoomAudioRecording | null;
}

export const initialWarRoomState: WarRoomState = {
  sessionsById: {},
  sessionIds: [],
  activeSessionId: null,
  listStatus: "idle",
  listError: null,
  threadsById: {},
  threadIdsByRoom: {},
  orphanThreadIds: [],
  threadsStatusByRoom: {},
  threadUserStateById: {},
  assignmentsByContainer: {},
  assignmentsLoadedKeys: {},
  agentConversationByThread: {},
  autoApproveByThread: {},
  audioRecording: null,
};

export type { ThreadTab };
