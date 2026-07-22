"use client";

/**
 * The gate that decides how much the capture tap retains.
 *
 * Two conditions must both hold for `full` retention:
 *   1. the viewer is an admin, and
 *   2. the capture feature is explicitly switched on.
 *
 * Otherwise the tap stays in `minimal` — a 3-exchange rolling window that
 * cannot accumulate. The floor is deliberately non-zero: "did anything even go
 * out?" must always be answerable, and a buffer of three can never be the
 * reason a tab runs out of memory.
 *
 * The preference lives in localStorage rather than the database on purpose —
 * it is a per-browser debugging switch, not user data worth a round trip.
 */

import { useCallback, useEffect, useState } from "react";

import { setCaptureMode } from "./recorder";

const PREF_KEY = "matrx.capture.full";

export function readCapturePref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PREF_KEY) === "true";
  } catch {
    // Private mode / storage disabled — default to the safe, tight setting.
    return false;
  }
}

/**
 * Apply the persisted preference at boot, before any UI mounts.
 *
 * Retention MUST NOT depend on the inspector being open. The whole point of
 * the buffer is to answer "what happened just now?" — if full retention only
 * switched on while the panel was mounted, the buffer would still be in
 * minimal mode during the very incident you then open the panel to inspect.
 *
 * A non-admin who somehow has the flag set is downgraded by `useCaptureEnabled`
 * as soon as Redux hydrates and the real admin level is known.
 */
export function applyPersistedCaptureMode(): void {
  if (readCapturePref()) setCaptureMode("full");
}

function writeCapturePref(enabled: boolean): void {
  try {
    window.localStorage.setItem(PREF_KEY, String(enabled));
  } catch {
    // Non-fatal: the mode still applies for this session.
  }
}

/**
 * Read and control full-capture retention.
 *
 * `isAdmin` is passed in rather than read here so this stays a plain hook with
 * no Redux dependency — the caller already knows the admin level and this file
 * is imported by the tap-adjacent modules.
 */
export function useCaptureEnabled(isAdmin: boolean): {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
} {
  const [enabled, setEnabledState] = useState(false);
  const [resolved, setResolved] = useState(false);

  // Hydration-safe: localStorage is read after mount, never during render.
  useEffect(() => {
    setEnabledState(isAdmin && readCapturePref());
    setResolved(true);
  }, [isAdmin]);

  // Apply to the recorder whenever either condition changes. Losing admin
  // immediately drops retention back to the floor and evicts the surplus.
  //
  // GUARDED ON `resolved` FOR A REASON: `enabled` starts false for one render
  // while the preference is still being read. Applying that transient false
  // would switch the recorder to `minimal` and evict the buffer — meaning the
  // act of opening the inspector destroyed the very history you opened it to
  // read. That bug was observed live; do not remove this guard.
  useEffect(() => {
    if (!resolved) return;
    setCaptureMode(isAdmin && enabled ? "full" : "minimal");
  }, [resolved, isAdmin, enabled]);

  const setEnabled = useCallback(
    (next: boolean) => {
      if (!isAdmin) return;
      writeCapturePref(next);
      setEnabledState(next);
    },
    [isAdmin],
  );

  return { enabled, setEnabled };
}
