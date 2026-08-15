// features/scheduling/hooks/useRunStream.ts
//
// Supabase realtime on sch_run for the visible task. Keeps the run history
// card fresh without polling. Only patches keys present in the payload —
// never overwrites task.enabled/next_due_at with undefined or null defaults.

"use client";

import { useEffect } from "react";
import { supabase } from "@/utils/supabase/client";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { subscribeSchedulerBroadcast } from "@/lib/scheduler-client/realtime";
import { removeRun, upsertRun } from "../redux/runs/slice";
import { patchTask } from "../redux/tasks/slice";
import type { AgendaTask, SchRunRow, SchTaskRow } from "../types";

function buildTaskPatch(row: Partial<SchTaskRow>): Partial<AgendaTask> | null {
  const patch: Partial<AgendaTask> = {};
  if ("enabled" in row && row.enabled !== undefined)
    patch.enabled = row.enabled;
  if ("next_due_at" in row) patch.nextDueAt = row.next_due_at ?? null;
  if ("last_run_at" in row) patch.lastRunAt = row.last_run_at ?? null;
  if ("updated_at" in row && row.updated_at) patch.updatedAt = row.updated_at;
  if ("title" in row && row.title) patch.title = row.title;
  if ("description" in row) patch.description = row.description ?? null;
  if ("tags" in row && Array.isArray(row.tags)) patch.tags = row.tags;
  if ("surfaces" in row && Array.isArray(row.surfaces))
    patch.surfaces = row.surfaces;
  return Object.keys(patch).length > 0 ? patch : null;
}

export function useRunStream(taskId: string | null | undefined) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);

  useEffect(() => {
    if (!taskId || !userId) return undefined;

    const unsubscribe = subscribeSchedulerBroadcast(
      supabase,
      userId,
      (event, payload) => {
        if (payload.schema !== "scheduler") return;
        if (payload.table === "sch_run") {
          const candidate = event === "DELETE" ? payload.old : payload.new;
          const run = candidate as Partial<SchRunRow> | null;
          if (run?.task_id !== taskId) return;
          if (event === "DELETE") {
            if (run.id) dispatch(removeRun(run.id));
            return;
          }
          dispatch(upsertRun(run as SchRunRow));
          return;
        }
        if (payload.table === "sch_task" && event === "UPDATE") {
          const row = payload.new as Partial<SchTaskRow> | null;
          if (row?.id !== taskId) return;
          const patch = buildTaskPatch(row);
          if (patch) dispatch(patchTask({ id: taskId, patch }));
        }
      },
    );

    return () => {
      void unsubscribe();
    };
  }, [dispatch, taskId, userId]);
}
