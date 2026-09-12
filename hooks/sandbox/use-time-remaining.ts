"use client";

import { useEffect, useState } from "react";
import { formatDurationMs } from "@ai-matrx/kit/format";

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
 * Returns `{ text: 'Ended', isExpired: true }` when `expiresAt` is past,
 * `{ text: 'No expiry', isExpired: false }` for the permanent-worker year-9999
 * sentinel, and `{ text: '--', isExpired: false }` when `expiresAt` is null. Callers
 * deciding whether to disable an "extend" button should use `isExpired` or
 * `millisRemaining`, never string-match against `text`.
 */
export function useTimeRemaining(
  expiresAt: string | null | undefined,
  granularity: Granularity = "minute",
): TimeRemaining {
  const [value, setValue] = useState<TimeRemaining>(() =>
    computeTimeRemaining(expiresAt, granularity),
  );

  useEffect(() => {
    setValue(computeTimeRemaining(expiresAt, granularity));
    if (!expiresAt) return undefined;
    const intervalMs = granularity === "second" ? 1000 : 30000;
    const interval = setInterval(() => {
      setValue(computeTimeRemaining(expiresAt, granularity));
    }, intervalMs);
    return () => clearInterval(interval);
  }, [expiresAt, granularity]);

  return value;
}

export function computeTimeRemaining(
  expiresAt: string | null | undefined,
  granularity: Granularity,
): TimeRemaining {
  if (!expiresAt) {
    return { text: "--", isExpired: false, millisRemaining: 0 };
  }
  if (expiresAt.startsWith("9999-12-31")) {
    return {
      text: "No expiry",
      isExpired: false,
      millisRemaining: Number.POSITIVE_INFINITY,
    };
  }

  // Postgres may serialize microseconds, while JavaScript's ISO parser accepts
  // milliseconds. Truncate only the excess fractional digits; never invent a
  // timestamp when the value is otherwise invalid.
  const normalizedExpiresAt = expiresAt.replace(/\.(\d{3})\d+/, ".$1");
  const expiresAtMillis = Date.parse(normalizedExpiresAt);
  if (!Number.isFinite(expiresAtMillis)) {
    return { text: "--", isExpired: false, millisRemaining: 0 };
  }
  const diff = expiresAtMillis - Date.now();
  if (diff <= 0) {
    return { text: "Ended", isExpired: true, millisRemaining: 0 };
  }
  // THE ONE HOME for "a millisecond count becomes a unit string" is
  // `@ai-matrx/kit/format`. A per-second countdown is the `clock` voice
  // ("1:05:23"); a per-minute one is `coarse` ("1h 5m", "45 min").
  const text = formatDurationMs(diff, {
    style: granularity === "second" ? "clock" : "coarse",
  });
  return { text, isExpired: false, millisRemaining: diff };
}
