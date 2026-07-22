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

  // Hydration-safe: localStorage is read after mount, never during render.
  useEffect(() => {
    setEnabledState(isAdmin && readCapturePref());
  }, [isAdmin]);

  // Apply to the recorder whenever either condition changes. Losing admin
  // immediately drops retention back to the floor and evicts the surplus.
  useEffect(() => {
    setCaptureMode(isAdmin && enabled ? "full" : "minimal");
  }, [isAdmin, enabled]);

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
