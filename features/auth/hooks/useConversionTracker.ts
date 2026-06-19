"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";

const VIEWS_KEY = "matrx.guest.surfaceViews";
const GATE_ATTEMPTS_KEY = "matrx.guest.gateAttempts";

interface CountMap {
  [key: string]: number;
}

/**
 * Per-guest counters for engagement signals.
 *
 * **Surface views** (`markViewed`): every public surface a guest visits.
 * Surfaces report themselves; the conversion nudge orchestrator reads
 * `totalViews` / `hasSeenAtLeast(n)` to decide whether to fire.
 *
 * **Gate attempts** (`markGateAttempt`): every time a guest tries a
 * soft-gated action and the `AuthGateDialog` opens (send chat, upload
 * file, save note, open agent, etc). Wired automatically inside
 * `useAuthGuardedAction` so callsites don't have to remember. Workspace-
 * level conversion nudges read `gateAttemptsFor(featureName)` to fire a
 * contextual inline card after N attempts.
 *
 * Authed users always read zero values and every marker is a no-op —
 * there's no signed-in conversion funnel to track.
 */
export function useConversionTracker(): {
  totalViews: number;
  totalGateAttempts: number;
  hasSeenAtLeast: (n: number) => boolean;
  gateAttemptsFor: (featureName: string) => number;
  markViewed: (surfaceId: string) => void;
  markGateAttempt: (featureName: string) => void;
  reset: () => void;
} {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const [views, setViews] = useState<CountMap>({});
  const [gateAttempts, setGateAttempts] = useState<CountMap>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawViews = window.localStorage.getItem(VIEWS_KEY);
      const rawAttempts = window.localStorage.getItem(GATE_ATTEMPTS_KEY);
      // Hydrate-from-storage on mount; this rule fires on the first read-
      // then-set, but the call is a one-shot SSR-safe sync (no cascading
      // renders) — the second setState in the same block is fine without
      // a disable since the rule only flags the first.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (rawViews) setViews(JSON.parse(rawViews) as CountMap);
      if (rawAttempts) setGateAttempts(JSON.parse(rawAttempts) as CountMap);
    } catch {
      // Malformed/blocked storage — fall back to zero, it's not load-bearing.
    }
  }, []);

  const writeStorage = (key: string, value: CountMap) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore — storage failure shouldn't crash the page.
    }
  };

  // Stable across renders: functional updaters never depend on the current
  // map, so `markViewed` / `markGateAttempt` identities don't change when the
  // counts change. That's what keeps an effect calling `markViewed` from
  // looping forever (Maximum update depth exceeded).
  const markViewed = useCallback(
    (surfaceId: string) => {
      if (isAuthenticated) return;
      setViews((prev) => {
        const next: CountMap = {
          ...prev,
          [surfaceId]: (prev[surfaceId] ?? 0) + 1,
        };
        writeStorage(VIEWS_KEY, next);
        return next;
      });
    },
    [isAuthenticated],
  );

  const markGateAttempt = useCallback(
    (featureName: string) => {
      if (isAuthenticated) return;
      setGateAttempts((prev) => {
        const next: CountMap = {
          ...prev,
          [featureName]: (prev[featureName] ?? 0) + 1,
        };
        writeStorage(GATE_ATTEMPTS_KEY, next);
        return next;
      });
    },
    [isAuthenticated],
  );

  const reset = useCallback(() => {
    setViews({});
    writeStorage(VIEWS_KEY, {});
    setGateAttempts({});
    writeStorage(GATE_ATTEMPTS_KEY, {});
  }, []);

  const totalViews = isAuthenticated
    ? 0
    : Object.values(views).reduce((sum, n) => sum + n, 0);

  const totalGateAttempts = isAuthenticated
    ? 0
    : Object.values(gateAttempts).reduce((sum, n) => sum + n, 0);

  const hasSeenAtLeast = useCallback(
    (n: number) => totalViews >= n,
    [totalViews],
  );

  const gateAttemptsFor = useCallback(
    (featureName: string) =>
      isAuthenticated ? 0 : (gateAttempts[featureName] ?? 0),
    [isAuthenticated, gateAttempts],
  );

  return {
    totalViews,
    totalGateAttempts,
    hasSeenAtLeast,
    gateAttemptsFor,
    markViewed,
    markGateAttempt,
    reset,
  };
}
