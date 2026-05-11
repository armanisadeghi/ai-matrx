// features/scheduling/redux/tasks/slice.ts
//
// Normalized scheduling.tasks state — `byId` map of AgendaTask plus per-id
// mutation status for optimistic-style writes.

import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { AgendaTask } from "../../types";

export type FetchStatus = "idle" | "loading" | "success" | "error";

export interface SchedulingTasksState {
  byId: Record<string, AgendaTask>;
  allIds: string[];
  fetchStatus: FetchStatus;
  fetchError: string | null;
  /** Per-task mutation status (saving / deleting / etc). */
  mutationStatus: Record<string, "idle" | "saving" | "deleting" | "error">;
  mutationError: Record<string, string | null>;
}

const initialState: SchedulingTasksState = {
  byId: {},
  allIds: [],
  fetchStatus: "idle",
  fetchError: null,
  mutationStatus: {},
  mutationError: {},
};

const schedulingTasksSlice = createSlice({
  name: "schedulingTasks",
  initialState,
  reducers: {
    // ── List fetch ──────────────────────────────────────────────────────
    fetchTasksPending(state) {
      state.fetchStatus = "loading";
      state.fetchError = null;
    },
    fetchTasksSuccess(state, action: PayloadAction<AgendaTask[]>) {
      state.fetchStatus = "success";
      state.fetchError = null;
      state.byId = {};
      state.allIds = [];
      for (const task of action.payload) {
        state.byId[task.id] = task;
        state.allIds.push(task.id);
      }
    },
    fetchTasksError(state, action: PayloadAction<string>) {
      state.fetchStatus = "error";
      state.fetchError = action.payload;
    },

    // ── Single-task upsert (used by detail fetch, realtime, optimistic) ──
    upsertTask(state, action: PayloadAction<AgendaTask>) {
      const task = action.payload;
      const existed = Boolean(state.byId[task.id]);
      state.byId[task.id] = task;
      if (!existed) state.allIds.unshift(task.id);
    },

    /** Apply a shallow patch to a known task. Used by realtime UPDATEs. */
    patchTask(
      state,
      action: PayloadAction<{ id: string; patch: Partial<AgendaTask> }>,
    ) {
      const t = state.byId[action.payload.id];
      if (!t) return;
      Object.assign(t, action.payload.patch);
    },

    removeTask(state, action: PayloadAction<string>) {
      delete state.byId[action.payload];
      state.allIds = state.allIds.filter((id) => id !== action.payload);
      delete state.mutationStatus[action.payload];
      delete state.mutationError[action.payload];
    },

    // ── Per-task mutation status ────────────────────────────────────────
    setMutationStatus(
      state,
      action: PayloadAction<{
        id: string;
        status: "idle" | "saving" | "deleting" | "error";
        error?: string | null;
      }>,
    ) {
      const { id, status, error } = action.payload;
      state.mutationStatus[id] = status;
      state.mutationError[id] = error ?? null;
    },

    clearMutationStatus(state, action: PayloadAction<string>) {
      delete state.mutationStatus[action.payload];
      delete state.mutationError[action.payload];
    },

    /** Hard reset, used on user logout. */
    resetTasks() {
      return initialState;
    },
  },
});

export const {
  fetchTasksPending,
  fetchTasksSuccess,
  fetchTasksError,
  upsertTask,
  patchTask,
  removeTask,
  setMutationStatus,
  clearMutationStatus,
  resetTasks,
} = schedulingTasksSlice.actions;

export default schedulingTasksSlice.reducer;
