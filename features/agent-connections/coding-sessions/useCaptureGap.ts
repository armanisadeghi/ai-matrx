"use client";

import {
  deliveryHistory,
  newestDeliveryAt,
} from "@/features/ai-work/conversations/bindingPlurality";
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

  // The newest DELIVERY, not the first row. An unclaimed handoff offer has
  // delivered nothing and now carries `last_seen_at = null`, which Postgres
  // sorts FIRST on a descending order — reading `sessions[0]` would hand this
  // verdict "nothing has ever arrived", its loudest alarm, to an owner whose
  // capture is running fine.
  const lastSeenAt = newestDeliveryAt(sessions);
  const verdict = captureGapVerdict({
    lastSeenAt,
    history: deliveryHistory(sessions),
    readSucceeded: checkedAtMs === 0 ? null : error === null,
    // The read's own timestamp, not render time: a verdict must describe the
    // moment the data was true, never drift as the component re-renders.
    // Before the first read completes this is 0 and unused — `readSucceeded`
    // is null there, which short-circuits to the "checking" verdict.
    nowMs: checkedAtMs,
  });

  return { verdict, lastSeenAt, loading, refresh };
}
