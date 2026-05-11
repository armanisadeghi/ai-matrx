// features/scheduling/redux/tasks/thunks.ts

import type { ThunkAction } from "redux-thunk";
import type { Action } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import {
  createAgentTask,
  deleteAgentTask,
  getAgentTask,
  listAgentTasks,
  runTaskNow,
  setTaskEnabled,
  updateAgentTask,
} from "../../service/queries";
import { computeNextFireTime } from "../../utils/nextFireTime";
import type {
  CreateAgentTaskInput,
  TriggerConfig,
  UpdateAgentTaskInput,
} from "../../types";
import {
  clearMutationStatus,
  fetchTasksError,
  fetchTasksPending,
  fetchTasksSuccess,
  patchTask,
  removeTask,
  setMutationStatus,
  upsertTask,
} from "./slice";

type AppThunk<T = void> = ThunkAction<Promise<T>, RootState, unknown, Action>;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const fetchScheduledTasks = (): AppThunk => async (dispatch) => {
  dispatch(fetchTasksPending());
  try {
    const tasks = await listAgentTasks();
    dispatch(fetchTasksSuccess(tasks));
  } catch (err) {
    dispatch(fetchTasksError(errMessage(err)));
    throw err;
  }
};

export const fetchScheduledTask =
  (id: string): AppThunk<boolean> =>
  async (dispatch) => {
    try {
      const task = await getAgentTask(id);
      if (!task) return false;
      dispatch(upsertTask(task));
      return true;
    } catch (err) {
      dispatch(
        setMutationStatus({ id, status: "error", error: errMessage(err) }),
      );
      throw err;
    }
  };

export const createScheduledTask =
  (input: CreateAgentTaskInput): AppThunk<string> =>
  async (dispatch) => {
    const { nextDueAt } = computeNextFireTime(input.trigger);
    const id = await createAgentTask(input, nextDueAt);

    const task = await getAgentTask(id);
    if (task) dispatch(upsertTask(task));
    return id;
  };

export const updateScheduledTask =
  (id: string, patch: UpdateAgentTaskInput): AppThunk =>
  async (dispatch) => {
    dispatch(setMutationStatus({ id, status: "saving" }));
    try {
      let nextDueAt: string | null | undefined;
      if (patch.trigger) {
        nextDueAt = computeNextFireTime(patch.trigger).nextDueAt;
      }
      await updateAgentTask(id, patch, nextDueAt);
      const task = await getAgentTask(id);
      if (task) dispatch(upsertTask(task));
      dispatch(clearMutationStatus(id));
    } catch (err) {
      dispatch(
        setMutationStatus({ id, status: "error", error: errMessage(err) }),
      );
      throw err;
    }
  };

export const deleteScheduledTask =
  (id: string): AppThunk =>
  async (dispatch) => {
    dispatch(setMutationStatus({ id, status: "deleting" }));
    try {
      await deleteAgentTask(id);
      dispatch(removeTask(id));
    } catch (err) {
      dispatch(
        setMutationStatus({ id, status: "error", error: errMessage(err) }),
      );
      throw err;
    }
  };

export const toggleTaskEnabled =
  (id: string, enabled: boolean): AppThunk =>
  async (dispatch) => {
    // Optimistic
    dispatch(patchTask({ id, patch: { enabled } }));
    try {
      await setTaskEnabled(id, enabled);
    } catch (err) {
      // Revert
      dispatch(patchTask({ id, patch: { enabled: !enabled } }));
      dispatch(
        setMutationStatus({ id, status: "error", error: errMessage(err) }),
      );
      throw err;
    }
  };

export const runTaskNowThunk =
  (id: string): AppThunk<string> =>
  async () => {
    return runTaskNow(id);
  };

/** Local-only re-compute of next_due_at for a trigger config (used by the form preview). */
export function localNextDueAt(trigger: TriggerConfig): string | null {
  try {
    return computeNextFireTime(trigger).nextDueAt;
  } catch {
    return null;
  }
}
