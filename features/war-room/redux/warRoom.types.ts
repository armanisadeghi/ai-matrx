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

  autoApproveByThread: Record<string, Record<string, boolean>>;
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
  autoApproveByThread: {},
};

export type { ThreadTab };
