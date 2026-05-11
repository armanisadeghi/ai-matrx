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

export const selectTaskById = (id: string | null | undefined) =>
  createSelector([selectTasksById], (byId) =>
    id ? (byId[id] ?? null) : null,
  );

export const selectFetchStatus = (state: RootState) =>
  selectSlice(state).fetchStatus;

export const selectFetchError = (state: RootState) =>
  selectSlice(state).fetchError;

export const selectTaskMutationStatus = (id: string) =>
  createSelector(
    [(state: RootState) => selectSlice(state).mutationStatus[id]],
    (status) => status ?? "idle",
  );

export const selectTaskMutationError = (id: string) =>
  createSelector(
    [(state: RootState) => selectSlice(state).mutationError[id]],
    (err) => err ?? null,
  );

export const selectEnabledTasks = createSelector([selectAllTasks], (tasks) =>
  tasks.filter((t) => t.enabled),
);

export const selectTasksByTag = (tag: string) =>
  createSelector([selectAllTasks], (tasks) =>
    tasks.filter((t) => t.tags.includes(tag)),
  );
