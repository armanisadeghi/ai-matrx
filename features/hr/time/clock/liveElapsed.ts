/**
 * features/hr/time/clock/liveElapsed.ts — the running "time since clock-in" display, and NOTHING
 * ELSE.
 *
 * 🚨 NO CLIENT COMPUTES HOURS (L3-74, SPEC-TIME §0 law 6, §9.2)
 * -------------------------------------------------------------
 * This file does not compute hours. `ClockState` already carries `elapsedWorkedMinutes`,
 * `elapsedBreakMinutes` and `dayTotalHours`, **computed server-side against the stamped zone, the
 * stamped jurisdiction and the rounding rules**. Those are the numbers every payable figure on
 * every Time surface comes from.
 *
 * What this file adds is a **ticker**: the server's minute count plus the wall-clock seconds that
 * have passed in this browser since that response arrived, so a clocked-in employee sees a clock
 * that moves instead of a number frozen at page load.
 *
 * Read the constraints, because they are what keep this from becoming the defect it looks like:
 *
 * 1. **It never touches a punch timestamp.** There is no `occurredAt`, no `startedAt`, no
 *    `endedAt`, no `ended_at − started_at` anywhere in this module. The only subtraction is
 *    `now − whenTheResponseArrived`, both of which are this browser's own monotonic-ish wall clock
 *    and neither of which is a fact about the employee's day. That is why a DST transition cannot
 *    corrupt it: no calendar arithmetic is performed at all.
 * 2. **The server value is the anchor and it wins on every refresh.** The drift a browser can
 *    accumulate is bounded by the poll interval, and every `clock_state` response resets it to
 *    zero.
 * 3. **It is never presented as the hours that will be paid.** {@link LIVE_DISPLAY_DISCLAIMER} is
 *    rendered beside it, always. The payable figure on this surface is `dayTotalHours`, which is
 *    the server's, and the two are never shown as the same thing.
 *
 * If you are here to add "just a small calculation" — a projected total, an overtime estimate, an
 * amount — the answer is no. Those come from `POST /hr/calc/overtime` in `prospective` mode and are
 * labelled as a preview (§1.4), and that endpoint is not this lane's.
 */

"use client";

import { useEffect, useState } from "react";

/**
 * The words that must accompany any live ticker on a clock surface. An hourly employee reading a
 * moving number will assume it is their pay unless told otherwise, and being wrong about that is a
 * wage conversation nobody should have to have.
 */
export const LIVE_DISPLAY_DISCLAIMER =
  "Live display only. Your paid hours are calculated from your recorded punches.";

/**
 * The server's minute count carried forward by the wall-clock seconds elapsed in this browser since
 * that response arrived. See the header for why this is not hours arithmetic.
 */
export function displayOnlyElapsedMinutes(
  serverElapsedMinutes: number,
  responseReceivedAtMs: number,
  nowMs: number,
): number {
  const sinceResponseMs = Math.max(0, nowMs - responseReceivedAtMs);
  return serverElapsedMinutes + Math.floor(sinceResponseMs / 60_000);
}

/** `2h 34m`, or `34m` under an hour. A duration label, never a time of day, never an amount. */
export function formatElapsedMinutes(minutes: number): string {
  const safe = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours === 0) return `${rest}m`;
  return `${hours}h ${rest}m`;
}

/**
 * Re-renders once a minute so the ticker moves. The server value stays the anchor: pass a fresh
 * `serverElapsedMinutes` / `responseReceivedAtMs` pair on every `clock_state` response and the
 * display snaps back to the server's truth.
 */
export function useLiveElapsedMinutes(
  serverElapsedMinutes: number,
  responseReceivedAtMs: number,
): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  return displayOnlyElapsedMinutes(serverElapsedMinutes, responseReceivedAtMs, nowMs);
}
