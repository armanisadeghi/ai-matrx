// features/scheduling/hooks/useScheduledTasks.ts

"use client";

import { useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllTasks,
  selectFetchError,
  selectFetchStatus,
} from "../redux/tasks/selectors";
import { fetchScheduledTasks } from "../redux/tasks/thunks";

export function useScheduledTasks() {
  const dispatch = useAppDispatch();
  const tasks = useAppSelector(selectAllTasks);
  const status = useAppSelector(selectFetchStatus);
  const error = useAppSelector(selectFetchError);

  const refetch = useCallback(() => {
    return dispatch(fetchScheduledTasks());
  }, [dispatch]);

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchScheduledTasks()).catch(() => {
        /* error already in slice */
      });
    }
  }, [dispatch, status]);

  return { tasks, status, error, refetch };
}
