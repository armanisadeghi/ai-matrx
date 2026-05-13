// features/scheduling/redux/tasks/thunks.ts
//
// Task-write thunks route through the aidream /scheduler/* HTTP router via
// schedulerClient.ts. The server is the authority for next_due_at — it
// recomputes on every trigger write, so the FE never sends one.
//
// Reads remain on Supabase (queries.ts) for the joined SELECT_AGENT_TASK
// shape. Agent-extension field patches (prompt/variables/etc.) still hit
// Supabase via queries.updateAgentTaskFields — there's no HTTP PATCH for
// sch_agent_task yet.

import type { Action } from "@reduxjs/toolkit";
import type { ThunkAction } from "redux-thunk";
import type { RootState } from "@/lib/redux/store";
import {
  getAgentTask,
  listAgentTasks,
  taskDetailToAgendaTask,
  updateAgentTaskFields,
} from "../../service/queries";
import * as scheduler from "../../service/schedulerClient";
import type {
  AgentTaskCreate,
  TriggerCreate,
} from "../../service/schedulerApi.types";
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

function triggerToConfig(trigger: TriggerConfig): Record<string, unknown> {
  const { type: _type, ...rest } = trigger as TriggerConfig & { type: string };
  return rest;
}

function inputToAgentTaskCreate(
  input: CreateAgentTaskInput,
): AgentTaskCreate {
  return {
    agent_id: input.agentId ?? null,
    prompt: input.prompt,
    variables: input.variables ?? {},
    persistent_conversation_id: input.persistentConversationId ?? null,
    auth_mode: input.authMode ?? "ask",
    max_runtime_seconds: input.maxRuntimeSeconds ?? 600,
    max_concurrent: input.maxConcurrent ?? 1,
  };
}

function triggerToCreate(trigger: TriggerConfig): TriggerCreate {
  return {
    type: trigger.type,
    config: triggerToConfig(trigger),
    enabled: true,
  };
}

// ── Reads ──────────────────────────────────────────────────────────────────

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

// ── Writes ─────────────────────────────────────────────────────────────────

export const createScheduledTask =
  (input: CreateAgentTaskInput): AppThunk<string> =>
  async (dispatch) => {
    const detail = await scheduler.createTask({
      kind: "agent",
      title: input.title,
      description: input.description ?? null,
      surfaces: input.surfaces ?? ["any"],
      tags: input.tags ?? [],
      queue: input.queue ?? "default",
      expires_at: input.expiresAt ?? null,
      enabled: true,
      agent_task: inputToAgentTaskCreate(input),
      trigger: triggerToCreate(input.trigger),
    });
    const task = taskDetailToAgendaTask(detail);
    dispatch(upsertTask(task));
    return task.id;
  };

export const updateScheduledTask =
  (id: string, patch: UpdateAgentTaskInput): AppThunk =>
  async (dispatch) => {
    dispatch(setMutationStatus({ id, status: "saving" }));
    try {
      if (patch.taskPatch && Object.keys(patch.taskPatch).length > 0) {
        await scheduler.patchTask(id, patch.taskPatch);
      }

      if (patch.agentPatch && Object.keys(patch.agentPatch).length > 0) {
        await updateAgentTaskFields(id, patch.agentPatch);
      }

      if (patch.trigger !== undefined && patch.trigger !== null) {
        // v0 = at most one trigger per task. Look up the existing one; patch
        // if present, otherwise create.
        const { triggers } = await scheduler.listTriggers(id);
        const existing = triggers[0];
        const triggerBody = {
          type: patch.trigger.type,
          config: triggerToConfig(patch.trigger),
        };
        if (existing) {
          await scheduler.patchTrigger(existing.id, triggerBody);
        } else {
          await scheduler.createTrigger({
            task_id: id,
            ...triggerBody,
            enabled: true,
          });
        }
      }

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
      await scheduler.softDeleteTask(id);
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
    dispatch(patchTask({ id, patch: { enabled } }));
    try {
      await scheduler.patchTask(id, { enabled });
    } catch (err) {
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
    const { run_id } = await scheduler.runNow(id);
    return run_id;
  };
