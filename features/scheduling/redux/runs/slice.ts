// features/scheduling/redux/runs/slice.ts

import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { SchRunRow } from "../../types";

export type RunsFetchStatus = "idle" | "loading" | "success" | "error";

interface PerTask {
  ids: string[];
  status: RunsFetchStatus;
  error: string | null;
}

export interface SchedulingRunsState {
  byId: Record<string, SchRunRow>;
  byTaskId: Record<string, PerTask>;
}

const initialState: SchedulingRunsState = { byId: {}, byTaskId: {} };

const emptyPerTask = (): PerTask => ({ ids: [], status: "idle", error: null });

const schedulingRunsSlice = createSlice({
  name: "schedulingRuns",
  initialState,
  reducers: {
    fetchRunsPending(state, action: PayloadAction<{ taskId: string }>) {
      const { taskId } = action.payload;
      const slot = state.byTaskId[taskId] ?? emptyPerTask();
      slot.status = "loading";
      slot.error = null;
      state.byTaskId[taskId] = slot;
    },
    fetchRunsSuccess(
      state,
      action: PayloadAction<{ taskId: string; runs: SchRunRow[] }>,
    ) {
      const { taskId, runs } = action.payload;
      const ids: string[] = [];
      for (const run of runs) {
        state.byId[run.id] = run;
        ids.push(run.id);
      }
      state.byTaskId[taskId] = { ids, status: "success", error: null };
    },
    fetchRunsError(
      state,
      action: PayloadAction<{ taskId: string; error: string }>,
    ) {
      const slot = state.byTaskId[action.payload.taskId] ?? emptyPerTask();
      slot.status = "error";
      slot.error = action.payload.error;
      state.byTaskId[action.payload.taskId] = slot;
    },
    /** Realtime + manual run insert: upsert and prepend to per-task list. */
    upsertRun(state, action: PayloadAction<SchRunRow>) {
      const run = action.payload;
      const existed = Boolean(state.byId[run.id]);
      state.byId[run.id] = run;
      const slot = state.byTaskId[run.task_id] ?? emptyPerTask();
      if (!existed) slot.ids.unshift(run.id);
      state.byTaskId[run.task_id] = slot;
    },
    removeRun(state, action: PayloadAction<string>) {
      const run = state.byId[action.payload];
      if (!run) return;
      delete state.byId[action.payload];
      const slot = state.byTaskId[run.task_id];
      if (slot) {
        slot.ids = slot.ids.filter((id) => id !== action.payload);
      }
    },
    resetRuns() {
      return initialState;
    },
  },
});

export const {
  fetchRunsPending,
  fetchRunsSuccess,
  fetchRunsError,
  upsertRun,
  removeRun,
  resetRuns,
} = schedulingRunsSlice.actions;

export default schedulingRunsSlice.reducer;
