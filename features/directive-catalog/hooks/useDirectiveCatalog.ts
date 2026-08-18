"use client";

/**
 * useDirectiveCatalog — live access to the backend directive catalog.
 *
 * Resolves the backend base URL from the canonical `apiConfigSlice` (so the
 * admin server toggle routes this too), fetches `GET /directives/catalog`, and
 * exposes a `refresh()` plus optional light polling so the grid reflects the
 * live backend without a redeploy. Aborts in-flight requests on unmount / base
 * change. Structured loading + error state — never swallowed.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { fetchDirectiveCatalog } from "@/features/directive-catalog/service";
import type { DirectiveCatalog } from "@/features/directive-catalog/types";

export interface UseDirectiveCatalogResult {
  catalog: DirectiveCatalog | null;
  isLoading: boolean;
  error: string | null;
  /** The base URL the catalog was fetched from (for display). */
  baseUrl: string | undefined;
  /** Epoch ms of the last successful load, or null. */
  lastUpdatedAt: number | null;
  /** Force an immediate refetch. */
  refresh: () => void;
}

/**
 * @param pollMs When > 0, polls the catalog on this interval (ms). Default 0
 *   (manual refresh only).
 */
export function useDirectiveCatalog(pollMs = 0): UseDirectiveCatalogResult {
  const baseUrl = useAppSelector(selectResolvedBaseUrl);

  const [catalog, setCatalog] = useState<DirectiveCatalog | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  // Bumping this triggers a refetch in the effect below.
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setNonce((n) => n + 1);
  }, []);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;
    fetchDirectiveCatalog(baseUrl, controller.signal)
      .then((data) => {
        if (cancelled) return;
        setCatalog(data);
        setLastUpdatedAt(Date.now());
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load catalog");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [baseUrl, nonce]);

  // Light polling — independent of the fetch effect so it only schedules ticks.
  useEffect(() => {
    if (pollMs <= 0) return undefined;
    const id = setInterval(() => setNonce((n) => n + 1), pollMs);
    return () => clearInterval(id);
  }, [pollMs]);

  return { catalog, isLoading, error, baseUrl, lastUpdatedAt, refresh };
}
