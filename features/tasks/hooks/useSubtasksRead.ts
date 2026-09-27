"use client";

/**
 * A task's subtasks, read from the database into the global tasks slice, with
 * the read's outcome (RC-B12 round 12). Subtasks render from
 * `selectSubtasksByParent` (Redux is the source of truth); this hook runs the
 * freshness read that fills it and reports whether that read succeeded, so a
 * subtask list says "No subtasks yet" only after a read that answered.
 *
 *   const subtasksRead = useSubtasksRead(taskId, orgId);
 *   subtasksRead.status === "error" && subtasks.length === 0 ? <ReadFailure …/> : …
 *
 * `taskService.getSubtasks` throws on failure (it used to return `[]`, which
 * every list then drew as "No subtasks yet").
 */
import { useAppDispatch } from "@/lib/redux/hooks";
import { useRead } from "@/components/read-state/useRead";
import { upsertTaskWithLevel } from "@/features/agent-context/redux/tasksSlice";
import * as taskService from "@/features/tasks/services/taskService";

export function useSubtasksRead(
  taskId: string | null | undefined,
  organizationId?: string | null,
) {
  const dispatch = useAppDispatch();
  const read = useRead(
    async () => {
      const rows = await taskService.getSubtasks(taskId as string);
      for (const row of rows) {
        dispatch(
          upsertTaskWithLevel({
            record: {
              id: row.id,
              title: row.title,
              status: row.status,
              priority: row.priority,
              due_date: row.due_date,
              assignee_id: row.assignee_id,
              project_id: row.project_id,
              parent_task_id: row.parent_task_id,
              organization_id: row.organization_id ?? organizationId ?? "",
              description: row.description,
              settings:
                (row as { settings?: Record<string, unknown> }).settings ??
                null,
              created_at: row.created_at ?? null,
              created_by: row.created_by,
            },
            level: "full-data",
          }),
        );
      }
      return rows.length;
    },
    [taskId ?? null, organizationId ?? null],
    { enabled: Boolean(taskId) },
  );
  return { status: read.status, error: read.error, retry: read.retry };
}
