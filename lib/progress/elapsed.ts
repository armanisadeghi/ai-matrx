"use client";

// lib/progress/elapsed.ts
//
// 🚨 A SCREEN THAT IS WORKING HAS TO MOVE.
//
// Cold walk 6, finding 6 (2026-09-17): the Triad's "Writing your cards…" and
// the Bad Example Probe's "Writing round N — a version of this work that looks
// right and is not." are the same sentence at second 1 and at second 61. Both
// were measured on brand-new Rulebooks that day: the probe's round 1 held one
// identical line for 61 consecutive seconds, the Triad's deal for 18, with no
// clock, no estimate and no incremental text. Other generation in the same
// product streams visibly (the Teach-back's paragraph, an Encore run), so the
// only reading a first-time Expert has for a motionless label is "stuck".
//
// A fabricated percentage would be a lie — nothing here knows a fraction. What
// is actually known is honest and enough: how long it has been, and how long
// this kind of work usually takes. So this is the shared clock every waiting
// surface reads, whether its wait is a durable run (`useDurableRun` owns its
// own ticker off the same constant) or a plain in-tab await (the Triad's deal).
//
// The sentence that ages — "this usually takes about a minute" before, "longer
// than usual, nothing has failed" after — already exists and is not rebuilt
// here: `lib/progress/estimateSentence.ts`.

import { useEffect, useState } from "react";
import { formatDurationMs } from "@ai-matrx/kit/format";

import { describeDuration, OVERDUE_GRACE_FACTOR } from "./estimateSentence";

/**
 * How often an elapsed clock on screen moves.
 *
 * ONE constant for the whole platform: `useDurableRun` and every plain-await
 * surface tick together, so two waiting lines on one screen never disagree
 * about what second it is.
 */
// KNOB MIRROR of platform.feature_knob "durable_run" "elapsed_tick_ms" — armed synchronously inside a React effect.
// Change the row, then re-mirror this literal; the value has no sync read path.
export const ELAPSED_TICK_MS = 1_000;

/** "2m 57s" / "48s" — the honest clock a stuck-looking screen owes the reader. */
export function formatElapsed(ms: number): string {
  return formatDurationMs(ms, { style: "compact", round: "down" });
}

/**
 * The quiet second line under whatever the work says it is doing: the clock,
 * and the promise — which stops being a promise the moment it is overtaken.
 *
 * Never a percentage, never a bar: nothing on this path knows a fraction of
 * anything, and inventing one is the lie this whole file exists to avoid.
 */
export function elapsedDetail({
  elapsedMs,
  usualMs,
  keepsGoingWithoutYou = false,
}: {
  elapsedMs: number;
  usualMs: number;
  /** True when the work survives the person leaving the page. */
  keepsGoingWithoutYou?: boolean;
}): string {
  const clock = formatElapsed(Math.max(0, elapsedMs));
  if (elapsedMs < usualMs * OVERDUE_GRACE_FACTOR) {
    return `${clock} so far — this usually takes ${describeDuration(usualMs)}.`;
  }
  return `${clock} so far — longer than usual. Nothing has failed${
    keepsGoingWithoutYou ? ", and it keeps going without you" : ""
  }.`;
}

/**
 * Milliseconds since `startedAt`, re-read every second while it is non-null.
 *
 * `useNow` (hooks/useNow.ts) is the 30-second clock for "has this expiry
 * passed" questions and is deliberately too coarse for this: a line that moves
 * twice a minute still reads as frozen. This is the fine one, and it exists
 * once so no surface hand-rolls a `setInterval` beside its own spinner again.
 */
export function useElapsedSince(startedAt: number | null): number {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    if (startedAt === null) {
      setElapsedMs(0);
      return undefined;
    }
    const tick = (): void => setElapsedMs(Math.max(0, Date.now() - startedAt));
    tick();
    const timer = setInterval(tick, ELAPSED_TICK_MS);
    return () => clearInterval(timer);
  }, [startedAt]);
  return elapsedMs;
}
