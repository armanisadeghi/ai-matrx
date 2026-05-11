// features/scheduling/hooks/useTaskRuns.ts

"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectRunsFetchError,
  selectRunsFetchStatus,
  selectRunsForTask,
} from "../redux/runs/selectors";
import { fetchRunsForTaskThunk } from "../redux/runs/thunks";

export function useTaskRuns(taskId: string | null | undefined, limit = 20) {
  const dispatch = useAppDispatch();
  const runs = useAppSelector(
    selectRunsForTask(taskId ?? "__noop__"),
  );
  const status = useAppSelector(
    selectRunsFetchStatus(taskId ?? "__noop__"),
  );
  const error = useAppSelector(
    selectRunsFetchError(taskId ?? "__noop__"),
  );

  useEffect(() => {
    if (!taskId) return;
    dispatch(fetchRunsForTaskThunk(taskId, limit)).catch(() => {
      /* error already in slice */
    });
  }, [dispatch, taskId, limit]);

  return { runs, status, error };
}
