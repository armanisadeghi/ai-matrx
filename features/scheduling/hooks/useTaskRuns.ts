// features/scheduling/hooks/useTaskRuns.ts

"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectRunsFetchError,
  selectRunsFetchStatus,
  selectRunsForTask,
} from "../redux/runs/selectors";
import { fetchRunsForTaskThunk } from "../redux/runs/thunks";
import type { SchRunRow } from "../types";

const EMPTY_RUNS: SchRunRow[] = [];

export function useTaskRuns(taskId: string | null | undefined, limit = 20) {
  const dispatch = useAppDispatch();
  const runs = useAppSelector((s) =>
    taskId ? selectRunsForTask(s, taskId) : EMPTY_RUNS,
  );
  const status = useAppSelector((s) =>
    taskId ? selectRunsFetchStatus(s, taskId) : "idle",
  );
  const error = useAppSelector((s) =>
    taskId ? selectRunsFetchError(s, taskId) : null,
  );
  const [requestAttempt, setRequestAttempt] = useState(0);

  useEffect(() => {
    if (!taskId) return;
    // Skip if a fetch is already in flight or this task's runs are already
    // loaded — `useRunStream` (Realtime) keeps the list live thereafter, so a
    // blind re-fetch on every ScheduleDetail mount/remount was pure waste.
    if (status === "loading" || status === "success") return;
    dispatch(fetchRunsForTaskThunk(taskId, limit)).catch(() => {
      /* error already in slice */
    });
  }, [dispatch, taskId, limit, requestAttempt]);

  const retry = useCallback(() => {
    if (!taskId) return;
    setRequestAttempt((attempt) => attempt + 1);
  }, [taskId]);

  return { runs, status, error, retry };
}
