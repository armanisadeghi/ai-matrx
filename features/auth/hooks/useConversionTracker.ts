"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";

const VIEWS_KEY = "matrx.guest.surfaceViews";

interface ViewMap {
  [surfaceId: string]: number;
}

/**
 * Per-guest counter of surface visits. Surfaces report themselves via
 * `markViewed(surfaceId)`; the hook accumulates counts in localStorage so
 * the data survives across navigations and sessions until the guest signs
 * up (or clears storage).
 *
 * Conversion nudges read `totalViews` and `hasSeenAtLeast(n)` to decide
 * whether to fire. Authed users always read zero values and the markers
 * are no-ops — there's no signed-in conversion funnel to track.
 */
export function useConversionTracker(): {
  totalViews: number;
  hasSeenAtLeast: (n: number) => boolean;
  markViewed: (surfaceId: string) => void;
  reset: () => void;
} {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const [views, setViews] = useState<ViewMap>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(VIEWS_KEY);
      // Hydrate-from-storage on mount; the rule fires on every read-then-set,
      // but this is a one-shot SSR-safe sync (no cascading renders).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setViews(JSON.parse(raw) as ViewMap);
    } catch {
      // Malformed/blocked storage — fall back to zero, it's not load-bearing.
    }
  }, []);

  const persist = useCallback((next: ViewMap) => {
    setViews(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    } catch {
      // Ignore — storage failure shouldn't crash the page.
    }
  }, []);

  const markViewed = useCallback(
    (surfaceId: string) => {
      if (isAuthenticated) return;
      const next: ViewMap = { ...views, [surfaceId]: (views[surfaceId] ?? 0) + 1 };
      persist(next);
    },
    [isAuthenticated, views, persist],
  );

  const reset = useCallback(() => {
    persist({});
  }, [persist]);

  const totalViews = isAuthenticated
    ? 0
    : Object.values(views).reduce((sum, n) => sum + n, 0);

  const hasSeenAtLeast = useCallback(
    (n: number) => totalViews >= n,
    [totalViews],
  );

  return { totalViews, hasSeenAtLeast, markViewed, reset };
}
