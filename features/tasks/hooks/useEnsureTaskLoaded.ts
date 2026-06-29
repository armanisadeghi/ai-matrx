"use client";

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectTaskById,
  selectTaskIsFullData,
  fetchTask,
} from "@/features/agent-context/redux/tasksSlice";

/**
 * Ensures a task row exists in the agent-context tasks slice at **full-data**
 * level before `TaskEditor` renders metadata (created_at, owner, description).
 *
 * Nav-tree hydration only stores thin-list fields — this hook upgrades on demand.
 */
export function useEnsureTaskLoaded(taskId: string) {
  const dispatch = useAppDispatch();
  const task = useAppSelector((s) => selectTaskById(s, taskId));
  const isFullData = useAppSelector((s) => selectTaskIsFullData(s, taskId));
  const [loading, setLoading] = useState(!task);
  const [missing, setMissing] = useState(false);
  const [metadataAttempted, setMetadataAttempted] = useState(isFullData);

  useEffect(() => {
    if (task && isFullData) {
      setLoading(false);
      setMissing(false);
      setMetadataAttempted(true);
      return undefined;
    }

    let cancelled = false;
    setLoading(!task);
    setMissing(false);
    setMetadataAttempted(false);

    void dispatch(fetchTask(taskId))
      .unwrap()
      .then(() => {
        if (cancelled) return;
        setLoading(false);
        setMetadataAttempted(true);
      })
      .catch(() => {
        if (cancelled) return;
        setMissing(!task);
        setLoading(false);
        setMetadataAttempted(true);
      });

    return () => {
      cancelled = true;
    };
  }, [taskId, task, isFullData, dispatch]);

  return {
    task,
    loading,
    missing,
    isFullData,
    metadataPending: !isFullData && !metadataAttempted,
  };
}
