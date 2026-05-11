// features/scheduling/hooks/useScheduledTasks.ts

"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllTasks,
  selectFetchError,
  selectFetchStatus,
} from "../redux/tasks/selectors";
import { fetchScheduledTasks } from "../redux/tasks/thunks";
import { useTaskListStream } from "./useTaskListStream";

export function useScheduledTasks() {
  const dispatch = useAppDispatch();
  const tasks = useAppSelector(selectAllTasks);
  const status = useAppSelector(selectFetchStatus);
  const error = useAppSelector(selectFetchError);

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchScheduledTasks()).catch(() => {
        /* error already in slice */
      });
    }
  }, [dispatch, status]);

  useTaskListStream();

  const refetch = () => dispatch(fetchScheduledTasks());

  return { tasks, status, error, refetch };
}
