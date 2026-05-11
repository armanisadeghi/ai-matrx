// features/scheduling/redux/runs/selectors.ts

import type { RootState } from "@/lib/redux/store";
import type { SchRunRow } from "../../types";

const selectSlice = (state: RootState) => state.schedulingRuns;

export const selectRunsById = (state: RootState) => selectSlice(state).byId;

const EMPTY_ARRAY: SchRunRow[] = [];

export const selectRunsForTask = (state: RootState, taskId: string): SchRunRow[] => {
  const slot = selectSlice(state).byTaskId[taskId];
  if (!slot) return EMPTY_ARRAY;
  const byId = selectSlice(state).byId;
  const out: SchRunRow[] = [];
  for (const id of slot.ids) {
    const r = byId[id];
    if (r) out.push(r);
  }
  return out;
};

export const selectRunsFetchStatus = (
  state: RootState,
  taskId: string,
): "idle" | "loading" | "success" | "error" =>
  selectSlice(state).byTaskId[taskId]?.status ?? "idle";

export const selectRunsFetchError = (
  state: RootState,
  taskId: string,
): string | null => selectSlice(state).byTaskId[taskId]?.error ?? null;

export const selectLatestRunForTask = (
  state: RootState,
  taskId: string,
): SchRunRow | null => {
  const runs = selectRunsForTask(state, taskId);
  return runs[0] ?? null;
};
