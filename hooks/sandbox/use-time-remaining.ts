"use client";

import { useEffect, useState } from "react";

export interface TimeRemaining {
  /** Pre-formatted string for display (e.g. "1h 5m 23s"). */
  text: string;
  /** True iff `expiresAt` is in the past. */
  isExpired: boolean;
  /** Raw remaining milliseconds — useful for "warn under 10 min" UI. */
  millisRemaining: number;
}

type Granularity = "second" | "minute";

/**
 * Live-ticking time-remaining display, derived from a sandbox's `expires_at`.
 *
 * Granularity controls cost vs precision:
 *   - `'second'` ticks every 1s and renders `Hh Mm Ss`. Use this for the
 *     focused sandbox detail page where the user is watching the clock.
 *   - `'minute'` ticks every 30s and renders `Hh Mm`. Use this for lists
 *     where dozens of rows could each be running their own interval.
 *
 * Returns `{ text: 'Ended', isExpired: true }` when `expiresAt` is past, and
 * `{ text: '--', isExpired: false }` when `expiresAt` is null. Callers
 * deciding whether to disable an "extend" button should use `isExpired` or
 * `millisRemaining`, never string-match against `text`.
 */
export function useTimeRemaining(
  expiresAt: string | null | undefined,
  granularity: Granularity = "minute",
): TimeRemaining {
  const [value, setValue] = useState<TimeRemaining>(() =>
    compute(expiresAt, granularity),
  );

  useEffect(() => {
    setValue(compute(expiresAt, granularity));
    if (!expiresAt) return undefined;
    const intervalMs = granularity === "second" ? 1000 : 30000;
    const interval = setInterval(() => {
      setValue(compute(expiresAt, granularity));
    }, intervalMs);
    return () => clearInterval(interval);
  }, [expiresAt, granularity]);

  return value;
}

function compute(
  expiresAt: string | null | undefined,
  granularity: Granularity,
): TimeRemaining {
  if (!expiresAt) {
    return { text: "--", isExpired: false, millisRemaining: 0 };
  }
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) {
    return { text: "Ended", isExpired: true, millisRemaining: 0 };
  }
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const text =
    granularity === "second"
      ? h > 0
        ? `${h}h ${m}m ${s}s`
        : m > 0
          ? `${m}m ${s}s`
          : `${s}s`
      : h > 0
        ? `${h}h ${m}m`
        : `${m}m`;
  return { text, isExpired: false, millisRemaining: diff };
}
