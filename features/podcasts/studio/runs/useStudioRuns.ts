"use client";

// features/podcasts/studio/runs/useStudioRuns.ts
//
// Loads the caller's podcast runs from the durable agent_run-backed endpoint
// (GET /podcast/runs) and polls while any run is still non-terminal (alive /
// stalled), so the manage page reflects progress without a websocket. Replaces
// the old useMyStudioRuns (which read the fragile pc_studio_runs table).

import { useCallback, useEffect, useRef, useState } from "react";
import { useBackendApi } from "@/hooks/useBackendApi";
import { useApiAuth } from "@/hooks/useApiAuth";
import { fetchRuns } from "./runsApi";
import { isNonTerminal, type RunSummary } from "./run-types";

const POLL_MS = 15_000;

export function useStudioRuns() {
  const api = useBackendApi();
  const { isAuthenticated } = useApiAuth();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const next = await fetchRuns(api, { signal });
        if (signal?.aborted) return;
        setRuns(next);
        setError(null);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load runs");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [api],
  );

  // Initial load (once auth is ready).
  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [isAuthenticated, load]);

  // Poll while any run is still moving (alive/stalled). Re-evaluated whenever
  // the run set changes, so polling stops once everything is terminal.
  const hasLiveRun = runs.some((r) => isNonTerminal(r.liveness));
  useEffect(() => {
    if (!isAuthenticated || !hasLiveRun) return;
    pollRef.current = setInterval(() => void load(), POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [isAuthenticated, hasLiveRun, load]);

  const refresh = useCallback(() => load(), [load]);

  return { runs, loading, error, refresh };
}
