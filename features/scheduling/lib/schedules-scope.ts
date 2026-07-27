// features/scheduling/lib/schedules-scope.ts
//
// Runtime scope builders for the `matrx-user/schedules` surface.
//
// The surface spans four routes (list, detail, edit, new) that each own a
// different slice of the declared vocabulary, so the builders are composable
// fragments rather than one monolithic function. Every fragment returns a
// partial that is spread into `createSchedulesScope(...)` at trigger time by
// the emitting component — see `components/list/ScheduleList.tsx`,
// `components/detail/ScheduleDetail.tsx`, `components/form/ScheduleForm.tsx`.

import { humanizeTrigger } from "../utils/triggerHumanize";
import type { AgendaTask, RunStatus, SchRunRow } from "../types";

type ScopeFragment = Record<string, unknown>;

/** Roster values — every route that hydrates `useScheduledTasks`. */
export function buildScheduleRosterValues(
  tasks: AgendaTask[],
  status: string,
  error: string | null,
): ScopeFragment {
  const loaded = status === "success";
  return {
    schedules_load_status: { status, error: error ?? null },
    ...(loaded
      ? {
          schedules_summary: tasks.map((t) => {
            const trigger = t.triggers[0];
            return {
              id: t.id,
              title: t.title,
              description: t.description,
              enabled: t.enabled,
              trigger_type: trigger?.type ?? null,
              trigger_summary: trigger
                ? humanizeTrigger(trigger.type, trigger.config)
                : null,
              next_due_at: t.nextDueAt,
              last_run_at: t.lastRunAt,
              surfaces: t.surfaces,
              tags: t.tags,
            };
          }),
          schedule_counts: {
            total: tasks.length,
            enabled: tasks.filter((t) => t.enabled).length,
            disabled: tasks.filter((t) => !t.enabled).length,
          },
        }
      : {}),
  };
}

/** Open-schedule + target-action values — detail and edit routes. */
export function buildOpenScheduleValues(task: AgendaTask): ScopeFragment {
  const trigger = task.triggers[0];
  const triggerValue = trigger
    ? {
        type: trigger.type,
        config: trigger.config,
        enabled: trigger.enabled,
        next_due_at: trigger.nextDueAt,
        last_fired_at: trigger.lastFiredAt,
      }
    : undefined;
  const executionLimits = {
    max_runtime_seconds: task.maxRuntimeSeconds,
    max_concurrent: task.maxConcurrent,
  };

  return {
    schedule_id: task.id,
    schedule_title: task.title,
    ...(task.description ? { schedule_description: task.description } : {}),
    schedule_enabled: task.enabled,
    ...(triggerValue
      ? {
          schedule_trigger: triggerValue,
          schedule_trigger_summary: humanizeTrigger(
            trigger!.type,
            trigger!.config,
          ),
        }
      : {}),
    ...(task.nextDueAt ? { schedule_next_due_at: task.nextDueAt } : {}),
    ...(task.lastRunAt ? { schedule_last_run_at: task.lastRunAt } : {}),
    schedule_surfaces: task.surfaces,
    schedule_tags: task.tags,
    schedule_queue: task.queue,
    ...(task.expiresAt ? { schedule_expires_at: task.expiresAt } : {}),
    ...(task.agentId ? { schedule_agent_id: task.agentId } : {}),
    schedule_prompt: task.prompt,
    schedule_variables: task.variables,
    ...(task.persistentConversationId
      ? { schedule_persistent_conversation_id: task.persistentConversationId }
      : {}),
    schedule_auth_mode: task.authMode,
    schedule_execution_limits: executionLimits,
    open_schedule: {
      id: task.id,
      title: task.title,
      description: task.description,
      enabled: task.enabled,
      queue: task.queue,
      surfaces: task.surfaces,
      tags: task.tags,
      next_due_at: task.nextDueAt,
      last_run_at: task.lastRunAt,
      expires_at: task.expiresAt,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
      trigger: triggerValue ?? null,
      agent_id: task.agentId,
      prompt: task.prompt,
      variables: task.variables,
      persistent_conversation_id: task.persistentConversationId,
      auth_mode: task.authMode,
      ...executionLimits,
    },
  };
}

/** Run-history values — detail route only. */
export function buildScheduleRunValues(
  runs: SchRunRow[],
  status: string,
  error: string | null,
): ScopeFragment {
  const byStatus: Partial<Record<RunStatus, number>> = {};
  for (const run of runs) {
    byStatus[run.status] = (byStatus[run.status] ?? 0) + 1;
  }
  const last = runs[0];
  return {
    schedule_runs_load_status: { status, error: error ?? null },
    ...(runs.length > 0
      ? {
          schedule_runs: runs.map((r) => ({
            id: r.id,
            status: r.status,
            surface: r.surface,
            queue: r.queue,
            due_at: r.due_at,
            started_at: r.started_at,
            finished_at: r.finished_at,
            result_summary: r.result_summary,
            error_message: r.error_message,
            output_ref: r.output_ref,
          })),
          schedule_run_summary: {
            loaded: runs.length,
            by_status: byStatus,
            last_status: last?.status ?? null,
            last_finished_at: last?.finished_at ?? null,
            last_error: last?.error_message ?? null,
          },
        }
      : {}),
  };
}
