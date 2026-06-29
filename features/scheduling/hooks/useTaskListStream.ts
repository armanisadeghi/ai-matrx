// features/scheduling/hooks/useTaskListStream.ts
//
// List-view realtime: subscribe to sch_task INSERT/UPDATE/DELETE for the
// current user so the list stays fresh without polling. Filters by
// user_id=eq.${userId} server-side per Supabase realtime conventions.

"use client";

import { useEffect } from "react";
import { supabase } from "@/utils/supabase/client";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
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

    const channel = supabase
      .channel(`sch_task-list-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sch_task",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as Partial<SchTaskRow>;
          if (row?.id) {
            // INSERT carries no joined agent/triggers — refetch the full shape.
            dispatch(fetchScheduledTask(row.id)).catch(() => {
              /* slice tracks error */
            });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sch_task",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as Partial<SchTaskRow>;
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
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "sch_task",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const oldRow = payload.old as Partial<SchTaskRow> | undefined;
          if (oldRow?.id) dispatch(removeTask(oldRow.id));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [dispatch, userId]);
}
