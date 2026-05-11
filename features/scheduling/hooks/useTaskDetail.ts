// features/scheduling/hooks/useTaskDetail.ts

"use client";

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectTaskById } from "../redux/tasks/selectors";
import { fetchScheduledTask } from "../redux/tasks/thunks";

export type LoadStatus = "idle" | "loading" | "success" | "not-found" | "error";

export function useTaskDetail(taskId: string | null | undefined) {
  const dispatch = useAppDispatch();
  const task = useAppSelector(selectTaskById(taskId ?? null));
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      setStatus("idle");
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
  }, [dispatch, taskId]);

  return { task, status, error };
}
