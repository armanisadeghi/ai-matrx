"use client";

// features/podcasts/studio/runs/useMyStudioRuns.ts
// The signed-in user's studio run history (newest first) for the dashboard.

import { useCallback, useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { studioRunsService } from "./service";
import type { PcStudioRun } from "@/features/podcasts/types";

export interface UseMyStudioRuns {
  runs: PcStudioRun[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMyStudioRuns(): UseMyStudioRuns {
  const userId = useAppSelector(selectUserId);
  const [runs, setRuns] = useState<PcStudioRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setRuns([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRuns(await studioRunsService.fetchRunsByUser(userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load your runs");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { runs, loading, error, refresh };
}
