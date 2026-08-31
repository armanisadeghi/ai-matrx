// features/scheduling/hooks/useTaskDetail.ts

"use client";

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectTaskById } from "../redux/tasks/selectors";
import { fetchScheduledTask } from "../redux/tasks/thunks";

export type LoadStatus = "idle" | "loading" | "success" | "not-found" | "error";

type RequestState = {
  taskId: string;
  status: Exclude<LoadStatus, "idle" | "loading">;
  error: string | null;
};

export function useTaskDetail(taskId: string | null | undefined) {
  const dispatch = useAppDispatch();
  const task = useAppSelector((s) => selectTaskById(s, taskId ?? null));
  const [requestState, setRequestState] = useState<RequestState | null>(null);

  const alreadyLoaded = !!task && task.id === taskId;
  const status: LoadStatus = !taskId
    ? "idle"
    : alreadyLoaded
      ? "success"
      : requestState?.taskId === taskId
        ? requestState.status
        : "loading";
  const error =
    requestState && requestState.taskId === taskId ? requestState.error : null;

  useEffect(() => {
    if (!taskId) return;
    // Already in the store from a prior navigation/mount — serve it without a
    // re-fetch. Task config changes are user-initiated (and update Redux on
    // save) and the run list has its own Realtime stream, so re-pulling the
    // row on every detail/edit mount was redundant.
    if (alreadyLoaded) return;

    dispatch(fetchScheduledTask(taskId))
      .then((found) => {
        setRequestState({
          taskId,
          status: found ? "success" : "not-found",
          error: null,
        });
      })
      .catch((err) => {
        setRequestState({
          taskId,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }, [dispatch, taskId, alreadyLoaded]);

  return { task, status, error };
}
