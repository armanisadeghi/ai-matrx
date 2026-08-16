"use client";

import { useCodingSessions } from "./useCodingSessions";
import { captureGapVerdict, type CaptureGapVerdict } from "./captureGap";

export interface CaptureGapState {
  verdict: CaptureGapVerdict;
  /** Timestamp of the most recent delivery, for surfaces that show it. */
  lastSeenAt: string | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * THE ONE path from loaded bindings to a capture-gap verdict. Every surface
 * that warns about stalled capture reads this, so `/work/conversations`,
 * `/work/connections`, and the technical diagnostics page can never disagree
 * about whether capture is running.
 *
 * Calibration uses the bindings already loaded by `useCodingSessions` — the
 * newest page of `last_seen_at` values — so detecting the outage costs no
 * extra query.
 */
export function useCaptureGap(): CaptureGapState {
  const { sessions, loading, error, checkedAtMs, refresh } = useCodingSessions();

  const lastSeenAt = sessions[0]?.last_seen_at ?? null;
  const verdict = captureGapVerdict({
    lastSeenAt,
    history: sessions.map((session) => session.last_seen_at),
    readSucceeded: checkedAtMs === 0 ? null : error === null,
    // The read's own timestamp, not render time: a verdict must describe the
    // moment the data was true, never drift as the component re-renders.
    nowMs: checkedAtMs === 0 ? Date.now() : checkedAtMs,
  });

  return { verdict, lastSeenAt, loading, refresh };
}
