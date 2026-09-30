// features/scheduling/hooks/useDuplicateSchedules.ts

"use client";

import { useEffect, useState } from "react";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { listDuplicateSchedules } from "../service/schedulerClient";
import type { DuplicateScheduleGroup } from "../service/schedulerApi.types";

/**
 * The caller's schedules that duplicate each other — THE SCHEDULER DUPLICATE
 * GUARD's read side.
 *
 * The grouping is computed SERVER-side and deliberately not mirrored here: the
 * fingerprint that decides what "the same schedule" means lives in
 * `matrx_scheduler.duplicate_guard`, and a second implementation in TypeScript
 * would drift from it the first time either side changed. This hook only
 * renders what the server already decided.
 *
 * Failure is non-fatal but never silent. This is an advisory surface layered on
 * top of a schedule list that remains usable without it; callers render a
 * retryable warning while the failure is also captured by Error Inspector.
 */
export function useDuplicateSchedules(refreshToken?: unknown) {
  const [groups, setGroups] = useState<DuplicateScheduleGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await listDuplicateSchedules();
        if (cancelled) return;
        setGroups(res.groups ?? []);
        setError(null);
      } catch (cause) {
        if (cancelled) return;
        const message =
          cause instanceof Error ? cause.message : "Unknown scheduler error";
        captureError({
          source: "runtime-exception",
          operation: "select",
          relation: "scheduler/tasks/duplicates",
          message: `Duplicate schedule check failed: ${message}`,
          userMessage: "Couldn't check for duplicate schedules.",
          recoverable: true,
          raw: cause,
        });
        setGroups([]);
        setError("Couldn't check for duplicate schedules.");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
    // refreshToken lets a caller re-check after it changes a schedule (pausing
    // one of a pair resolves its group, and the banner must then disappear).
  }, [refreshToken, refreshVersion]);

  // A group whose extras are all paused costs nothing and is already resolved.
  const liveGroups = groups.filter((g) => g.enabled_count > 1);

  return {
    groups: liveGroups,
    error,
    refetch: () => setRefreshVersion((version) => version + 1),
  };
}
