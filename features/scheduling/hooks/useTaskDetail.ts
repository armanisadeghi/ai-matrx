// features/scheduling/hooks/useTaskDetail.ts

"use client";

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectTaskById } from "../redux/tasks/selectors";
import { fetchScheduledTask } from "../redux/tasks/thunks";

export type LoadStatus = "idle" | "loading" | "success" | "not-found" | "error";

export function useTaskDetail(taskId: string | null | undefined) {
  const dispatch = useAppDispatch();
  const task = useAppSelector((s) => selectTaskById(s, taskId ?? null));
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const alreadyLoaded = !!task && task.id === taskId;

  useEffect(() => {
    if (!taskId) {
      setStatus("idle");
      return;
    }
    // Already in the store from a prior navigation/mount — serve it without a
    // re-fetch. Task config changes are user-initiated (and update Redux on
    // save) and the run list has its own Realtime stream, so re-pulling the
    // row on every detail/edit mount was redundant.
    if (alreadyLoaded) {
      setStatus("success");
      setError(null);
      return;
    }
    setStatus("loading");
    dispatch(fetchScheduledTask(taskId))
      .then((found) => {
        setStatus(found ? "success" : "not-found");
        setError(null);
      })
      .catch((err) => {
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [dispatch, taskId, alreadyLoaded]);

  return { task, status, error };
}
