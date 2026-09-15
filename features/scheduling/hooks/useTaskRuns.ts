// features/scheduling/hooks/useTaskRuns.ts

"use client";

import { useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectRunsFetchError,
  selectRunsFetchStatus,
  selectRunsForTask,
} from "../redux/runs/selectors";
import { fetchRunsForTaskThunk } from "../redux/runs/thunks";
import type { SchRunRow } from "../types";

const EMPTY_RUNS: SchRunRow[] = [];

export function useTaskRuns(
  taskId: string | null | undefined,
  limit = 20,
  requiredRunIds: readonly string[] = [],
) {
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
  const [settledRequestKey, setSettledRequestKey] = useState<string | null>(
    null,
  );
  const mounted = useRef(true);
  const requiredIdsKey = [...new Set(requiredRunIds)].sort().join(",");
  const dispatchedRequestKey = useRef<string | null>(null);
  const missingRequiredRun = requiredRunIds.some(
    (requiredId) => !runs.some((run) => run.id === requiredId),
  );
  const requestKey = `${taskId ?? ""}:${limit}:${requiredIdsKey}:${requestAttempt}`;

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  useEffect(() => {
    if (!taskId) return;
    // Skip if a fetch is already in flight or this task's runs are already
    // loaded — `useRunStream` (Realtime) keeps the list live thereafter, so a
    // blind re-fetch on every ScheduleDetail mount/remount was pure waste. A
    // request signature is attempted once even when it settles as an error or
    // an old referenced run no longer exists; only Retry changes the signature.
    if (status === "loading" || dispatchedRequestKey.current === requestKey)
      return;
    if (status === "success" && !missingRequiredRun) return;
    dispatchedRequestKey.current = requestKey;
    void dispatch(
      fetchRunsForTaskThunk(
        taskId,
        limit,
        requiredIdsKey ? requiredIdsKey.split(",") : [],
      ),
    )
      .catch(() => {
        /* error already in slice */
      })
      .finally(() => {
        if (mounted.current) setSettledRequestKey(requestKey);
      });
  }, [
    dispatch,
    taskId,
    limit,
    requiredIdsKey,
    missingRequiredRun,
    requestAttempt,
    status,
  ]);

  const retry = () => {
    if (!taskId) return;
    setSettledRequestKey(null);
    setRequestAttempt((attempt) => attempt + 1);
  };

  return {
    runs,
    status,
    error,
    retry,
    requiredRunsSettled:
      !missingRequiredRun || settledRequestKey === requestKey,
  };
}
