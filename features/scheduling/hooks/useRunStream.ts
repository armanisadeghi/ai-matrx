// features/scheduling/hooks/useRunStream.ts
//
// Supabase realtime subscription on sch_run for the visible task. Keeps
// the run history card fresh without polling.

"use client";

import { useEffect } from "react";
import { supabase } from "@/utils/supabase/client";
import { useAppDispatch } from "@/lib/redux/hooks";
import { removeRun, upsertRun } from "../redux/runs/slice";
import { patchTask } from "../redux/tasks/slice";
import type { SchRunRow, SchTaskRow } from "../types";

export function useRunStream(taskId: string | null | undefined) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!taskId) return;

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
          dispatch(
            patchTask({
              id: taskId,
              patch: {
                enabled: row.enabled ?? undefined,
                nextDueAt: row.next_due_at ?? null,
                lastRunAt: row.last_run_at ?? null,
              },
            }),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dispatch, taskId]);
}
