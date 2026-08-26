"use client";

/**
 * features/hr/time/shared/useHrTimeQuery.ts — the one read hook the timesheet surfaces mount on.
 *
 * WHY A HOOK AND NOT A SERVER COMPONENT. Every read in this lane is a `public.hr_*` RPC called
 * **client → Supabase direct** (CLAUDE.md: reads never go through Next.js). The surfaces are also
 * interactive — filters, selection, inline resolution — so they are Client Components already.
 *
 * WHAT IT DELIBERATELY IS NOT: a cache, a store, or a second data layer. It runs the promise the
 * caller hands it, tracks three states, and re-runs when the caller says to. A refusal arrives as
 * an `HrRpcError` and is handed back **whole**, because `userMessage` is rendered verbatim and a
 * hook that flattened it to a boolean would destroy the only sentence the user can act on.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { HR_MOCK_ENABLED, type HrFixtureCase } from "@/features/hr/mock/transport";
import { HrRpcError } from "../api/rpc";

/**
 * Which fixture the mock lane should answer with, from `?mockCase=`.
 *
 * 🚨 This is a **build-lane affordance for L3-78**, not a product feature: it is how the ugly
 * states — the advisory line with no amount, the DST day, the preserved disagreement, the
 * violation exception that refuses `excused` — get looked at before any SQL exists. It returns
 * `undefined` whenever `NEXT_PUBLIC_HR_MOCK` is off, so it is inert in every real environment and
 * a URL parameter can never steer a live read.
 */
export function useHrMockCase(): HrFixtureCase | undefined {
  const params = useSearchParams();
  if (!HR_MOCK_ENABLED) return undefined;
  const raw = params.get("mockCase");
  if (raw === "happy" || raw === "empty" || raw === "error" || raw === "edge") return raw;
  return undefined;
}

export interface HrTimeQuery<T> {
  data: T | null;
  /** True only on the FIRST load. A refetch keeps the rendered rows — a table that blanks on every
   *  filter change reads as broken even when it is fast. */
  loading: boolean;
  refreshing: boolean;
  /** The typed refusal, whole. Render `.userMessage` verbatim. */
  error: HrRpcError | Error | null;
  refetch: () => void;
}

/**
 * @param run     the service call, given an AbortSignal
 * @param deps    re-run when any of these change (they are compared by identity, so pass primitives)
 * @param enabled skip the call entirely — for a route whose ids have not resolved yet
 */
export function useHrTimeQuery<T>(
  run: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  enabled = true,
): HrTimeQuery<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<HrRpcError | Error | null>(null);
  const [nonce, setNonce] = useState(0);
  const loadedOnce = useRef(false);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let live = true;

    if (loadedOnce.current) setRefreshing(true);
    else setLoading(true);

    runRef
      .current(controller.signal)
      .then((result) => {
        if (!live) return;
        setData(result);
        setError(null);
        loadedOnce.current = true;
      })
      .catch((caught: unknown) => {
        if (!live || controller.signal.aborted) return;
        // Never swallowed. A refusal that does not reach the screen is a surface that lies.
        setError(
          caught instanceof HrRpcError || caught instanceof Error
            ? caught
            : new Error(String(caught)),
        );
      })
      .finally(() => {
        if (!live) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      live = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, nonce, ...deps]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, refreshing, error, refetch };
}
