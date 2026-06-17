"use client";

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectTaskById,
  upsertTaskWithLevel,
} from "@/features/agent-context/redux/tasksSlice";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { getTaskById } from "@/features/tasks/services/taskService";

/**
 * Ensures a task row exists in the agent-context tasks slice before
 * `TaskEditor` mounts. No-ops when the task is already present.
 */
export function useEnsureTaskLoaded(taskId: string) {
  const dispatch = useAppDispatch();
  const orgId = useAppSelector(selectOrganizationId);
  const task = useAppSelector((s) => selectTaskById(s, taskId));
  const [loading, setLoading] = useState(!task);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (task) {
      setLoading(false);
      setMissing(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setMissing(false);

    void getTaskById(taskId).then((row) => {
      if (cancelled) return;
      if (!row) {
        setMissing(true);
        setLoading(false);
        return;
      }
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
            organization_id: row.organization_id ?? orgId ?? "",
            description: row.description,
            settings:
              (row as { settings?: Record<string, unknown> }).settings ?? null,
            created_at: row.created_at ?? null,
            user_id: row.user_id,
          },
          level: "full-data",
        }),
      );
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [taskId, task, dispatch, orgId]);

  return { task, loading, missing };
}
