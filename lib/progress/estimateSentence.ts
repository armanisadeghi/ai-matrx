// lib/progress/estimateSentence.ts
//
// 🚨 AN ESTIMATE THAT HAS BEEN OVERTAKEN IS A LIE, AND IT MUST CORRECT ITSELF.
//
// Cold walk, 2026-09-16, finding #7: the Quick Build dialog said "Building —
// this takes about a minute." and then sat on that sentence, unchanged, for
// roughly three minutes while step 2 stayed on Running. Nothing on the screen
// ever acknowledged that the promise had been broken, so the only honest
// reading available to the person watching was "this is stuck" — which it was
// not. A screen is absent or honest, never lying.
//
// The rule: a duration estimate is a promise with an expiry. Before the usual
// time, say the usual time. After it, say plainly that this one is taking
// longer, say how long it has actually been, and say that nothing has failed —
// because the ONLY question a person has at that moment is "is this broken?".
//
// This is a platform primitive rather than the Build's private copy because
// every long-running surface makes the same promise: builds, audits, imports,
// distillations, trials.
//
// 🚨 AND THE PROMISE IS NOT ONLY ABOUT TIME. Cold walk, 2026-09-16, finding
// #2: this sentence said "Nothing has failed" while the step list rendered two
// centimetres below it showed step 2 as "Failed", in red. The reassurance was
// computed from the clock and never consulted the steps. So `steps` is a
// REQUIRED input: an author cannot reach this sentence without handing over
// the same collection their step list renders, and a failed step wins over
// every time-based word here. See `lib/progress/honestSummary.ts`.

import {
  failureSummary,
  type ProgressStep,
} from "./honestSummary";

const MINUTE_MS = 60_000;

export interface EstimateSentenceInput {
  /** Milliseconds since the work started. */
  elapsedMs: number;
  /** How long this work usually takes, in milliseconds. */
  usualMs: number;
  /**
   * What is happening, as a gerund phrase starting the sentence —
   * "Building", "Importing your notes", "Checking every rule".
   */
  doing: string;
  /**
   * True when the work survives the person leaving the page. Said out loud
   * once the estimate has been overtaken, because "can I close this?" is the
   * second question after "is it broken?".
   */
  keepsGoingWithoutYou?: boolean;
  /**
   * The SAME steps the surface renders. Required, not optional: the whole
   * defect was a reassurance that never looked at them. Pass `[]` only for a
   * surface that genuinely renders no steps — and then say so out loud.
   */
  steps: readonly ProgressStep[];
  /** What the person can do when a step has failed. */
  failureRemedy?: string;
}

/** Whole minutes, rounded down, at least one. */
function minutesSoFar(elapsedMs: number): number {
  return Math.max(1, Math.floor(elapsedMs / MINUTE_MS));
}

/** "about a minute" / "about 3 minutes" — plain words, never "~60s". */
export function describeDuration(ms: number): string {
  if (ms < 90_000) return "about a minute";
  const minutes = Math.round(ms / MINUTE_MS);
  return `about ${minutes} minutes`;
}

/**
 * The one sentence a person reads while they wait — honest at every moment of
 * the wait, not only at the start.
 */
export function estimateSentence({
  elapsedMs,
  usualMs,
  doing,
  keepsGoingWithoutYou = false,
  steps,
  failureRemedy,
}: EstimateSentenceInput): string {
  // The steps outrank the clock. Whatever the elapsed time says, a person
  // looking at a red "Failed" row must never be told nothing has failed.
  const failed = failureSummary(steps, failureRemedy);
  if (failed) return failed;

  // A grace band: nobody wants "taking longer than usual" the second the
  // estimate ticks over, and a hair-trigger warning is its own false alarm.
  const overdueAt = usualMs * 1.5;

  if (elapsedMs < overdueAt) {
    return `${doing} — this usually takes ${describeDuration(usualMs)}.`;
  }

  const minutes = minutesSoFar(elapsedMs);
  const tail = keepsGoingWithoutYou
    ? " Nothing has failed, and it keeps going without you."
    : " Nothing has failed.";
  return `Still ${doing.toLowerCase()} after ${minutes} ${
    minutes === 1 ? "minute" : "minutes"
  } — longer than usual.${tail}`;
}
