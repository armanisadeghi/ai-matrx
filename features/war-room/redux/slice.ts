// features/war-room/redux/slice.ts
//
// RTK slice for War Room — session/thread linkage + UI state only.

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  containerKey,
  SINGLE_ACTIVE_ENTITY_TYPES,
  type ThreadTab,
  type ThreadUserState,
  type WarRoomAssignment,
  type WarRoomSession,
  type WarRoomThread,
} from "../types";
import { initialWarRoomState, type LoadStatus } from "./warRoom.types";

function removeId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : ids;
}

function demoteSiblings(
  list: WarRoomAssignment[],
  entityType: string,
  keepId: string,
): void {
  for (const a of list) {
    if (a.entity_type === entityType && a.id !== keepId) a.is_active = false;
  }
}

const warRoomSlice = createSlice({
  name: "warRoom",
  initialState: initialWarRoomState,
  reducers: {
    setListStatus(state, action: PayloadAction<LoadStatus>) {
      state.listStatus = action.payload;
      if (action.payload !== "error") state.listError = null;
    },
    setListError(state, action: PayloadAction<string | null>) {
      state.listError = action.payload;
      if (action.payload) state.listStatus = "error";
    },
    sessionsLoaded(state, action: PayloadAction<WarRoomSession[]>) {
      state.sessionsById = {};
      state.sessionIds = [];
      for (const s of action.payload) {
        state.sessionsById[s.id] = s;
        state.sessionIds.push(s.id);
      }
      state.listStatus = "ready";
      state.listError = null;
    },
    sessionUpserted(state, action: PayloadAction<WarRoomSession>) {
      const s = action.payload;
      const existed = !!state.sessionsById[s.id];
      state.sessionsById[s.id] = s;
      if (!existed) state.sessionIds.unshift(s.id);
    },
    sessionRemoved(state, action: PayloadAction<string>) {
      const id = action.payload;
      delete state.sessionsById[id];
      state.sessionIds = removeId(state.sessionIds, id);
      if (state.activeSessionId === id) state.activeSessionId = null;
    },
    setActiveSession(state, action: PayloadAction<string | null>) {
      state.activeSessionId = action.payload;
    },

    setThreadsStatus(
      state,
      action: PayloadAction<{ roomId: string; status: LoadStatus }>,
    ) {
      state.threadsStatusByRoom[action.payload.roomId] = action.payload.status;
    },
    threadsLoadedForRoom(
      state,
      action: PayloadAction<{ roomId: string; threads: WarRoomThread[] }>,
    ) {
      const { roomId, threads } = action.payload;
      const ids: string[] = [];
      for (const t of threads) {
        state.threadsById[t.id] = t;
        ids.push(t.id);
      }
      state.threadIdsByRoom[roomId] = ids;
      state.threadsStatusByRoom[roomId] = "ready";
    },
    orphanThreadsLoaded(state, action: PayloadAction<string[]>) {
      state.orphanThreadIds = action.payload;
    },
    threadUpserted(state, action: PayloadAction<WarRoomThread>) {
      const t = action.payload;
      state.threadsById[t.id] = t;
    },
    threadMembershipChanged(
      state,
      action: PayloadAction<{
        threadId: string;
        fromRoomId: string | null;
        toRoomId: string;
      }>,
    ) {
      const { threadId, fromRoomId, toRoomId } = action.payload;
      if (fromRoomId && state.threadIdsByRoom[fromRoomId]) {
        state.threadIdsByRoom[fromRoomId] = removeId(
          state.threadIdsByRoom[fromRoomId],
          threadId,
        );
      }
      const toList = state.threadIdsByRoom[toRoomId] ?? [];
      if (!toList.includes(threadId)) toList.push(threadId);
      state.threadIdsByRoom[toRoomId] = toList;
      state.orphanThreadIds = removeId(state.orphanThreadIds, threadId);
    },
    threadOrphaned(
      state,
      action: PayloadAction<{ threadId: string; fromRoomId: string }>,
    ) {
      const { threadId, fromRoomId } = action.payload;
      if (state.threadIdsByRoom[fromRoomId]) {
        state.threadIdsByRoom[fromRoomId] = removeId(
          state.threadIdsByRoom[fromRoomId],
          threadId,
        );
      }
      if (!state.orphanThreadIds.includes(threadId)) {
        state.orphanThreadIds.push(threadId);
      }
    },
    threadRemoved(
      state,
      action: PayloadAction<{ id: string; roomId: string }>,
    ) {
      const { id, roomId } = action.payload;
      delete state.threadsById[id];
      if (state.threadIdsByRoom[roomId]) {
        state.threadIdsByRoom[roomId] = removeId(
          state.threadIdsByRoom[roomId],
          id,
        );
      }
      state.orphanThreadIds = removeId(state.orphanThreadIds, id);
      delete state.assignmentsByContainer[containerKey("thread", id)];
      delete state.assignmentsLoadedKeys[containerKey("thread", id)];
      delete state.threadUserStateById[id];
      delete state.autoApproveByThread[id];
    },
    setThreadActiveTab(
      state,
      action: PayloadAction<{ id: string; tab: ThreadTab }>,
    ) {
      const t = state.threadsById[action.payload.id];
      if (t) t.active_tab = action.payload.tab;
    },
    setThreadUserState(
      state,
      action: PayloadAction<{ id: string; state: ThreadUserState }>,
    ) {
      state.threadUserStateById[action.payload.id] = action.payload.state;
    },
    setThreadUserStateBulk(
      state,
      action: PayloadAction<Record<string, ThreadUserState>>,
    ) {
      for (const [id, userState] of Object.entries(action.payload)) {
        state.threadUserStateById[id] = userState;
      }
    },
    setThreadPosition(
      state,
      action: PayloadAction<{ id: string; position: number }>,
    ) {
      const t = state.threadsById[action.payload.id];
      if (t) t.position = action.payload.position;
    },

    assignmentsLoadedBulk(
      state,
      action: PayloadAction<{
        byContainer: Record<string, WarRoomAssignment[]>;
      }>,
    ) {
      for (const [key, rows] of Object.entries(action.payload.byContainer)) {
        state.assignmentsByContainer[key] = rows;
        state.assignmentsLoadedKeys[key] = true;
      }
    },
    assignmentsLoadedForContainer(
      state,
      action: PayloadAction<{ key: string; assignments: WarRoomAssignment[] }>,
    ) {
      state.assignmentsByContainer[action.payload.key] =
        action.payload.assignments;
      state.assignmentsLoadedKeys[action.payload.key] = true;
    },
    assignmentUpserted(
      state,
      action: PayloadAction<{ key: string; assignment: WarRoomAssignment }>,
    ) {
      const { key, assignment } = action.payload;
      const list = state.assignmentsByContainer[key] ?? [];
      if (
        assignment.is_active &&
        SINGLE_ACTIVE_ENTITY_TYPES.has(assignment.entity_type)
      ) {
        demoteSiblings(list, assignment.entity_type, assignment.id);
      }
      const idx = list.findIndex((a) => a.id === assignment.id);
      if (idx >= 0) list[idx] = assignment;
      else list.push(assignment);
      state.assignmentsByContainer[key] = list;
    },
    assignmentRemoved(
      state,
      action: PayloadAction<{ key: string; id: string }>,
    ) {
      const list = state.assignmentsByContainer[action.payload.key];
      if (list) {
        state.assignmentsByContainer[action.payload.key] = list.filter(
          (a) => a.id !== action.payload.id,
        );
      }
    },
    assignmentActiveSet(
      state,
      action: PayloadAction<{
        key: string;
        entityType: string;
        entityId: string;
      }>,
    ) {
      const { key, entityType, entityId } = action.payload;
      const list = state.assignmentsByContainer[key];
      if (!list) return;
      for (const a of list) {
        if (a.entity_type === entityType) {
          a.is_active = a.entity_id === entityId;
        }
      }
    },

    agentConversationsLoaded(
      state,
      action: PayloadAction<Record<string, string | null>>,
    ) {
      for (const [threadId, convoId] of Object.entries(action.payload)) {
        state.agentConversationByThread[threadId] = convoId;
      }
    },

    setThreadAutoApprove(
      state,
      action: PayloadAction<{
        threadId: string;
        scope: string;
        value: boolean;
      }>,
    ) {
      const { threadId, scope, value } = action.payload;
      const cur = state.autoApproveByThread[threadId] ?? {};
      if (value) cur[scope] = true;
      else delete cur[scope];
      if (Object.keys(cur).length > 0)
        state.autoApproveByThread[threadId] = cur;
      else delete state.autoApproveByThread[threadId];
    },
    clearThreadAutoApprove(
      state,
      action: PayloadAction<{ threadId: string; scope?: string }>,
    ) {
      const { threadId, scope } = action.payload;
      if (!scope) {
        delete state.autoApproveByThread[threadId];
        return;
      }
      const cur = state.autoApproveByThread[threadId];
      if (!cur) return;
      delete cur[scope];
      if (Object.keys(cur).length === 0)
        delete state.autoApproveByThread[threadId];
    },

    // ── Room-level recording ownership (D14 fence) ─────────────────────────
    // Written ONLY by the RoomRecordingController / its completion callbacks —
    // the tile's CleanupPad is a VIEW over this state, never a writer.
    roomRecordingStarted(
      state,
      action: PayloadAction<{ threadId: string; sessionId: string }>,
    ) {
      state.audioRecording = {
        threadId: action.payload.threadId,
        sessionId: action.payload.sessionId,
        status: "recording",
      };
    },
    roomRecordingFinalizing(state) {
      if (state.audioRecording) state.audioRecording.status = "finalizing";
    },
    roomRecordingCleared(state) {
      state.audioRecording = null;
    },

    clearRoomThreads(state, action: PayloadAction<string>) {
      const roomId = action.payload;
      const ids = state.threadIdsByRoom[roomId] ?? [];
      for (const id of ids) {
        delete state.assignmentsByContainer[containerKey("thread", id)];
        delete state.assignmentsLoadedKeys[containerKey("thread", id)];
      }
      delete state.assignmentsByContainer[containerKey("room", roomId)];
      delete state.assignmentsLoadedKeys[containerKey("room", roomId)];
      delete state.threadIdsByRoom[roomId];
      delete state.threadsStatusByRoom[roomId];
    },
  },
});

export const {
  setListStatus,
  setListError,
  sessionsLoaded,
  sessionUpserted,
  sessionRemoved,
  setActiveSession,
  setThreadsStatus,
  threadsLoadedForRoom,
  orphanThreadsLoaded,
  threadUpserted,
  threadMembershipChanged,
  threadOrphaned,
  threadRemoved,
  setThreadActiveTab,
  setThreadUserState,
  setThreadUserStateBulk,
  setThreadPosition,
  assignmentsLoadedBulk,
  assignmentsLoadedForContainer,
  assignmentUpserted,
  assignmentRemoved,
  assignmentActiveSet,
  agentConversationsLoaded,
  setThreadAutoApprove,
  clearThreadAutoApprove,
  roomRecordingStarted,
  roomRecordingFinalizing,
  roomRecordingCleared,
  clearRoomThreads,
} = warRoomSlice.actions;

export default warRoomSlice.reducer;
