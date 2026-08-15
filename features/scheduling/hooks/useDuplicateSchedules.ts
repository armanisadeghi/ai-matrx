// features/scheduling/hooks/useDuplicateSchedules.ts

"use client";

import { useCallback, useEffect, useState } from "react";
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
 * Failure is silent by design. This is an advisory surface layered on top of a
 * schedule list that works perfectly without it; a duplicates lookup that 404s
 * on an older server must never turn the user's working list into an error
 * page. `groups` simply stays empty.
 */
export function useDuplicateSchedules(refreshToken?: unknown) {
  const [groups, setGroups] = useState<DuplicateScheduleGroup[]>([]);

  const refetch = useCallback(async () => {
    try {
      const res = await listDuplicateSchedules();
      setGroups(res.groups ?? []);
    } catch {
      setGroups([]);
    }
  }, []);

  useEffect(() => {
    void refetch();
    // refreshToken lets a caller re-check after it changes a schedule (pausing
    // one of a pair resolves its group, and the banner must then disappear).
  }, [refetch, refreshToken]);

  // A group whose extras are all paused costs nothing and is already resolved.
  const liveGroups = groups.filter((g) => g.enabled_count > 1);

  return { groups: liveGroups, refetch };
}
