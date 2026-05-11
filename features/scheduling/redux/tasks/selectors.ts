// features/scheduling/redux/tasks/selectors.ts

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { AgendaTask } from "../../types";

const selectSlice = (state: RootState) => state.schedulingTasks;

export const selectTasksById = (state: RootState) => selectSlice(state).byId;
export const selectTaskIds = (state: RootState) => selectSlice(state).allIds;

export const selectAllTasks = createSelector(
  [selectTasksById, selectTaskIds],
  (byId, ids): AgendaTask[] => ids.map((id) => byId[id]).filter(Boolean),
);

/**
 * Read a single task by id. Returns null when not in the store.
 * Parameterized selectors are factory-free — call from useAppSelector with
 * the id as a closure capture: `useAppSelector(s => selectTaskById(s, id))`.
 */
export const selectTaskById = (
  state: RootState,
  id: string | null | undefined,
): AgendaTask | null => {
  if (!id) return null;
  return selectSlice(state).byId[id] ?? null;
};

export const selectFetchStatus = (state: RootState) =>
  selectSlice(state).fetchStatus;

export const selectFetchError = (state: RootState) =>
  selectSlice(state).fetchError;

export const selectTaskMutationStatus = (
  state: RootState,
  id: string,
): "idle" | "saving" | "deleting" | "error" =>
  selectSlice(state).mutationStatus[id] ?? "idle";

export const selectTaskMutationError = (
  state: RootState,
  id: string,
): string | null => selectSlice(state).mutationError[id] ?? null;

export const selectEnabledTasks = createSelector([selectAllTasks], (tasks) =>
  tasks.filter((t) => t.enabled),
);
