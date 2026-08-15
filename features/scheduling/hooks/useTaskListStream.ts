// features/scheduling/hooks/useTaskListStream.ts
//
// List-view realtime: private per-user Broadcast hints keep the durable,
// RLS-fetched schedule list fresh without putting scheduler churn through
// Realtime's per-WAL-row RLS evaluator.

"use client";

import { useEffect } from "react";
import { supabase } from "@/utils/supabase/client";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { subscribeSchedulerBroadcast } from "@/lib/scheduler-client/realtime";
import { fetchScheduledTask } from "../redux/tasks/thunks";
import { patchTask, removeTask } from "../redux/tasks/slice";
import type { AgendaTask, SchTaskRow } from "../types";

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

export function useTaskListStream() {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);

  useEffect(() => {
    if (!userId) return undefined;

    const unsubscribe = subscribeSchedulerBroadcast(
      supabase,
      userId,
      (event, payload) => {
        if (payload.schema !== "scheduler" || payload.table !== "sch_task")
          return;
        if (event === "INSERT") {
          const row = payload.new as Partial<SchTaskRow> | null;
          if (row?.id) {
            // INSERT carries no joined agent/triggers — refetch the full shape.
            dispatch(fetchScheduledTask(row.id)).catch(() => {
              /* slice tracks error */
            });
          }
          return;
        }
        if (event === "UPDATE") {
          const row = payload.new as Partial<SchTaskRow> | null;
          const id = row?.id;
          if (!id) return;
          // A soft-delete fires as an UPDATE (deleted_at flips from null to
          // a timestamp). Treat it as a removal so the list view drops the
          // row immediately for any other session the user has open.
          if ("deleted_at" in row && row.deleted_at) {
            dispatch(removeTask(id));
            return;
          }
          const patch = buildTaskPatch(row);
          if (patch) dispatch(patchTask({ id, patch }));
          return;
        }
        if (event === "DELETE") {
          const oldRow = payload.old as Partial<SchTaskRow> | null;
          if (oldRow?.id) dispatch(removeTask(oldRow.id));
        }
      },
    );

    return () => {
      void unsubscribe();
    };
  }, [dispatch, userId]);
}
