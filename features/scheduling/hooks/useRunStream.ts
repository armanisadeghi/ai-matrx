// features/scheduling/hooks/useRunStream.ts
//
// Supabase realtime on sch_run for the visible task. Keeps the run history
// card fresh without polling. Only patches keys present in the payload —
// never overwrites task.enabled/next_due_at with undefined or null defaults.

"use client";

import { useEffect } from "react";
import { supabase } from "@/utils/supabase/client";
import { useAppDispatch } from "@/lib/redux/hooks";
import { removeRun, upsertRun } from "../redux/runs/slice";
import { patchTask } from "../redux/tasks/slice";
import type { AgendaTask, SchRunRow, SchTaskRow } from "../types";

function buildTaskPatch(row: Partial<SchTaskRow>): Partial<AgendaTask> | null {
  const patch: Partial<AgendaTask> = {};
  if ("enabled" in row && row.enabled !== undefined) patch.enabled = row.enabled;
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

  useEffect(() => {
    if (!taskId) return undefined;

    const channel = supabase
      .channel(`sch_run-${taskId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sch_run",
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Partial<SchRunRow> | undefined;
            if (oldRow?.id) dispatch(removeRun(oldRow.id));
            return;
          }
          const row = payload.new as SchRunRow;
          dispatch(upsertRun(row));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sch_task",
          filter: `id=eq.${taskId}`,
        },
        (payload) => {
          const row = payload.new as Partial<SchTaskRow>;
          const patch = buildTaskPatch(row);
          if (patch) dispatch(patchTask({ id: taskId, patch }));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [dispatch, taskId]);
}
