"use client";

/**
 * The task list's read, as one status every task view gates on (RC-B12
 * round 12): the hierarchy fetch loads the tasks, so its status and error are
 * the list's. `retry` re-runs that fetch. A task view's empty state renders
 * only when `status === "ready"` — never while loading, never after a failure.
 */
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectTasksReadError, selectTasksReadStatus } from "@/features/tasks/redux/taskUiSlice";
import { loadProjectsWithTasks } from "@/features/tasks/redux/thunks";

export function useTasksRead() {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectTasksReadStatus);
  const error = useAppSelector(selectTasksReadError);
  return {
    status,
    error,
    retry: () => {
      void dispatch(loadProjectsWithTasks({ force: true }));
    },
  };
}
