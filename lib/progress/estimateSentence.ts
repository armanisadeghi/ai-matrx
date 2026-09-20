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
  type RunShape,
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
  /**
   * Whether those steps are ordered milestones or independent units over a
   * pile. Required for the same reason `steps` is: the sentence a failure
   * earns is different in each, and guessing produced "Nothing after it will
   * run" over fifteen files that ran perfectly well (see `honestSummary.ts`).
   */
  shape: RunShape;
  /** What the person can do when a step has failed. */
  failureRemedy?: string;
}

/**
 * The grace band before an estimate is treated as overtaken. Nobody wants
 * "taking longer than usual" the second the estimate ticks over, and a
 * hair-trigger warning is its own false alarm. Exported because the elapsed
 * clock beside this sentence (`lib/progress/elapsed.ts`) must flip at exactly
 * the same moment — two waiting lines that disagree about whether a run is
 * late are worse than either one alone.
 */
export const OVERDUE_GRACE_FACTOR = 1.5;

/** Whole minutes, rounded down, at least one. */
function minutesSoFar(elapsedMs: number): number {
  return Math.max(1, Math.floor(elapsedMs / MINUTE_MS));
}

/**
 * "a few seconds" / "about 10 seconds" / "about a minute" / "about 3 minutes"
 * — plain words, never "~60s".
 *
 * 🚨 SUB-MINUTE WORK GETS A SUB-MINUTE PROMISE (cold walk 13, 2026-09-20, N8).
 * Everything under 90 seconds used to round UP to "about a minute", so the
 * three Masterwork openings this walk timed — each a handful of database
 * round-trips and no model call at all — could not state an honest promise:
 * "about a minute" over two seconds of work is the same class of untrue
 * sentence as the constant estimate this file was written to kill, pointing
 * the other way. A promise that is too generous never corrects itself either,
 * because the overdue band is computed from it.
 *
 * Rounded to five-second steps below a minute, because nobody wants "about 17
 * seconds" and a number that precise is a claim the platform cannot keep.
 */
export function describeDuration(ms: number): string {
  if (ms < 7_500) return "a few seconds";
  if (ms < 45_000) {
    const seconds = Math.round(ms / 5_000) * 5;
    return `about ${seconds} seconds`;
  }
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
  shape,
  failureRemedy,
}: EstimateSentenceInput): string {
  // The steps outrank the clock. Whatever the elapsed time says, a person
  // looking at a red "Failed" row must never be told nothing has failed.
  const failed = failureSummary(steps, shape, failureRemedy);
  if (failed) return failed;

  const overdueAt = usualMs * OVERDUE_GRACE_FACTOR;

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
