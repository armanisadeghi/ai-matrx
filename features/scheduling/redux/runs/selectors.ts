// features/scheduling/redux/runs/selectors.ts

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";

const selectSlice = (state: RootState) => state.schedulingRuns;

export const selectRunsById = (state: RootState) => selectSlice(state).byId;
const selectByTask = (state: RootState) => selectSlice(state).byTaskId;

export const selectRunsForTask = (taskId: string) =>
  createSelector([selectRunsById, selectByTask], (byId, byTask) => {
    const slot = byTask[taskId];
    if (!slot) return [];
    return slot.ids.map((id) => byId[id]).filter(Boolean);
  });

export const selectRunsFetchStatus = (taskId: string) =>
  createSelector(
    [selectByTask],
    (byTask) => byTask[taskId]?.status ?? "idle",
  );

export const selectRunsFetchError = (taskId: string) =>
  createSelector(
    [selectByTask],
    (byTask) => byTask[taskId]?.error ?? null,
  );

export const selectLatestRunForTask = (taskId: string) =>
  createSelector([selectRunsForTask(taskId)], (runs) => runs[0] ?? null);
