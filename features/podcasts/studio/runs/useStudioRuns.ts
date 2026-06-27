"use client";

// features/podcasts/studio/runs/useStudioRuns.ts
//
// Loads the caller's podcast runs from the durable agent_run-backed read and
// stays fresh via Supabase Realtime on agent_run (Transport 1) — the manage
// page reflects progress live while runs are active and goes silent when idle,
// with no polling. Replaces the old useMyStudioRuns (which read the fragile
// pc_studio_runs table).

import { useCallback, useEffect, useState } from "react";
import { useApiAuth } from "@/hooks/useApiAuth";
import { useRunListRealtime } from "@/hooks/useRunListRealtime";
import { fetchPodcastRuns } from "./runsRepository";
import type { RunSummary } from "./run-types";

export function useStudioRuns() {
  const { isAuthenticated } = useApiAuth();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      // Direct Supabase read (RLS-scoped to the user) — no backend hop.
      const next = await fetchPodcastRuns();
      if (signal?.aborted) return;
      setRuns(next);
      setError(null);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : "Failed to load runs");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

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

  // Live updates via Realtime on agent_run (owner-scoped). Fires whenever any
  // of the user's runs changes — a debounced refetch keeps the computed list
  // (liveness etc.) current. Always-on while authed so a brand-new run also
  // appears, which an interval gated on "has live run" would have missed. The
  // wider debounce coalesces heartbeat bursts during an active generation.
  useRunListRealtime({
    table: "agent_run",
    enabled: isAuthenticated,
    onChange: () => void load(),
    debounceMs: 1_000,
  });

  const refresh = useCallback(() => load(), [load]);

  return { runs, loading, error, refresh };
}
