// features/scheduling/hooks/useRunStream.ts
//
// Supabase realtime on sch_run for the visible task. Keeps the run history
// card fresh without polling. Only patches keys present in the payload —
// never overwrites task.enabled/next_due_at with undefined or null defaults.

"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { browserAdminLaneOpen } from "@/utils/supabase/adminLane";
import { selectTaskById } from "../redux/tasks/selectors";
import { subscribeSchedulerBroadcast } from "@/lib/scheduler-client/realtime";
import { removeRun, upsertRun } from "../redux/runs/slice";
import { fetchRunsForTaskThunk } from "../redux/runs/thunks";
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

/** How often the admin seat re-reads a run history it cannot rely on a live feed for. */
export const ADMIN_SEAT_RUN_REFRESH_MS = 10_000;

/**
 * WHOSE FEED A TASK'S RUNS ARRIVE ON. The scheduler broadcasts per OWNER
 * (`scheduler:user:<owner>`). On a user page the owner is the viewer. On the
 * admin seat the admin reads someone else's task, so the feed to join is the
 * task OWNER's — and with no owner known yet there is no feed to join (never
 * the admin's own, which would be a silent room of one).
 */
export function runStreamOwnerId(args: {
  viewerId: string | null | undefined;
  taskOwnerId: string | null | undefined;
  adminSeat: boolean;
}): string | null {
  if (args.adminSeat) return args.taskOwnerId ?? null;
  return args.viewerId ?? null;
}

export function useRunStream(taskId: string | null | undefined) {
  const dispatch = useAppDispatch();
  const viewerId = useAppSelector(selectUserId);
  const taskOwnerId = useAppSelector(
    (state) => selectTaskById(state, taskId)?.userId ?? null,
  );
  const adminSeat = browserAdminLaneOpen();
  const userId = runStreamOwnerId({ viewerId, taskOwnerId, adminSeat });

  // Realtime join authorization carries no admin lane, so on the admin seat the
  // owner's feed may be refused; the history is also re-read on a timer there.
  useEffect(() => {
    if (!taskId || !adminSeat) return undefined;
    const timer = setInterval(
      () => void dispatch(fetchRunsForTaskThunk(taskId)),
      ADMIN_SEAT_RUN_REFRESH_MS,
    );
    return () => clearInterval(timer);
  }, [dispatch, taskId, adminSeat]);

  useEffect(() => {
    if (!taskId || !userId) return undefined;

    const unsubscribe = subscribeSchedulerBroadcast(
      userId,
      (event, payload) => {
        // Realtime has no replay: the package is telling us the socket was
        // away, so re-read rather than reconstruct events we never saw.
        if (event === "resync" || payload === null) {
          void dispatch(fetchRunsForTaskThunk(taskId));
          return;
        }
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

    return unsubscribe;
  }, [dispatch, taskId, userId]);
}
