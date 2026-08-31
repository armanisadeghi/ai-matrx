// features/scheduling/redux/runs/selectors.ts

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { SchRunRow } from "../../types";

export type SchedulingRunsRootState = Pick<RootState, "schedulingRuns">;

const selectSlice = (state: SchedulingRunsRootState) => state.schedulingRuns;

export const selectRunsById = (state: SchedulingRunsRootState) =>
  selectSlice(state).byId;

const EMPTY_ARRAY: SchRunRow[] = [];

const selectRunIdsForTask = (
  state: SchedulingRunsRootState,
  taskId: string,
): string[] =>
  selectSlice(state).byTaskId[taskId]?.ids ?? EMPTY_ARRAY;

export const selectRunsForTask = createSelector(
  [selectRunIdsForTask, selectRunsById],
  (ids, byId): SchRunRow[] => {
    const out: SchRunRow[] = [];
    for (const id of ids) {
      const run = byId[id];
      if (run) out.push(run);
    }
    return out;
  },
);

export const selectRunsFetchStatus = (
  state: SchedulingRunsRootState,
  taskId: string,
): "idle" | "loading" | "success" | "error" =>
  selectSlice(state).byTaskId[taskId]?.status ?? "idle";

export const selectRunsFetchError = (
  state: SchedulingRunsRootState,
  taskId: string,
): string | null => selectSlice(state).byTaskId[taskId]?.error ?? null;

export const selectLatestRunForTask = (
  state: SchedulingRunsRootState,
  taskId: string,
): SchRunRow | null => {
  const runs = selectRunsForTask(state, taskId);
  return runs[0] ?? null;
};
