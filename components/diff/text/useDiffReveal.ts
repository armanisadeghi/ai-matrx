"use client";

/**
 * useDiffReveal — the "fill it in as it comes" animation for an ALREADY-KNOWN
 * before→after edit.
 *
 * The motivating case: an agent patch (`ctx_patch` str_replace / a working-doc
 * edit) arrives WHOLE the instant the tool starts — the model has told us the
 * exact text being removed and the exact text replacing it. There is nothing to
 * wait for. But a diff that simply *appears* feels dead. So we give it the live
 * FEEL the same way Google/Perplexity pace already-complete search results: a
 * client-side, paced reveal.
 *
 * The reveal models the human mental picture of an edit landing:
 *   1. HOLD — briefly show the document with the OLD text still present (the
 *      span the agent is "removing"). The caller tints it destructive.
 *   2. FILL — progressively reveal the NEW text into that span (a quick,
 *      snappy type-in), so the replacement visibly streams in.
 *   3. SETTLE — land on the final before→after diff.
 *
 * Mechanically it interpolates the `modified` string from `before` (old span
 * intact) to the full `after`, one paced step at a time, ONLY within the region
 * that actually changed (found via a cheap common-prefix/suffix scan). Feed the
 * emitted `{ before, modified }` into the canonical `DiffViewer`/`TextDiff`
 * highlight view and it renders the right thing at every frame for free: during
 * HOLD the old text shows struck/removed, during FILL the revealed new chars
 * light up as added while the not-yet-revealed remainder of the old span still
 * reads as removed.
 *
 * When `active` is false (persisted / reloaded / not the latest activity) it
 * returns the final `{ before, after }` immediately — no timer, no animation.
 *
 * This is a generic diff primitive (lives beside the diff engine), reusable by
 * any surface that wants to animate a known edit being applied — patch tool
 * renderers today, note/version "apply this change" affordances tomorrow.
 *
 * Timer discipline mirrors `useGraduatedReveal`: the interval is cleared on
 * unmount, on `active` flipping false, and whenever `replayKey` / the texts
 * change — so a re-run never leaves a stray interval or overlapping reveals.
 */

import { useEffect, useMemo, useRef, useState } from "react";

export interface DiffRevealOptions {
  /**
   * While true, the new text fills in on a timer. While false the final diff
   * is returned immediately (persisted / reloaded / not the latest activity).
   */
  active: boolean;
  /**
   * Characters revealed per tick during the FILL phase. The reveal is paced
   * to land in roughly a fixed wall-clock budget regardless of length, so this
   * is a floor — long replacements reveal in bigger steps. Default 3.
   */
  charsPerTick?: number;
  /** Milliseconds between ticks. Default 28 (snappy, ~36fps-ish). */
  intervalMs?: number;
  /** Ticks to HOLD on the removal frame before filling. Default 6 (~170ms). */
  holdTicks?: number;
  /**
   * Total wall-clock budget (ms) the FILL phase aims to finish within, so a
   * huge replacement doesn't crawl. The effective step grows to meet it.
   * Default 1100.
   */
  budgetMs?: number;
  /** Bump to restart the reveal from the beginning (e.g. a fresh callId). */
  replayKey?: string | number;
}

export interface DiffReveal {
  /** The original text (the diff's left side) — stable across the reveal. */
  before: string;
  /** The interpolated new text for THIS frame (grows toward `after`). */
  modified: string;
  /** True while still holding or filling (animation in progress). */
  isRevealing: boolean;
  /** The phase, for callers that want to tint the removal hold explicitly. */
  phase: "hold" | "fill" | "done";
}

/** Index of the first char where the two strings diverge. */
function commonPrefixLen(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

/** Length of the shared suffix that doesn't overlap the prefix. */
function commonSuffixLen(a: string, b: string, prefix: number): number {
  const maxA = a.length - prefix;
  const maxB = b.length - prefix;
  const n = Math.min(maxA, maxB);
  let i = 0;
  while (
    i < n &&
    a.charCodeAt(a.length - 1 - i) === b.charCodeAt(b.length - 1 - i)
  ) {
    i++;
  }
  return i;
}

/**
 * Animate the `after` text filling into `before`. Returns `{ before, modified }`
 * to feed the highlight diff, plus phase/`isRevealing` for tinting + gating.
 */
export function useDiffReveal(
  before: string,
  after: string,
  opts: DiffRevealOptions,
): DiffReveal {
  const {
    active,
    charsPerTick = 3,
    intervalMs = 28,
    holdTicks = 6,
    budgetMs = 1100,
    replayKey,
  } = opts;

  // The changed region: everything between the shared prefix and shared suffix.
  // We only animate THIS slice of `after`; the rest is identical to `before`,
  // so the surrounding (unchanged) text is present and stable from frame 0.
  const region = useMemo(() => {
    const prefix = commonPrefixLen(before, after);
    const suffix = commonSuffixLen(before, after, prefix);
    const head = after.slice(0, prefix);
    const tail = suffix > 0 ? after.slice(after.length - suffix) : "";
    const newMiddle = after.slice(prefix, after.length - suffix);
    // The matching middle of `before` (the text being removed). During HOLD and
    // the early FILL frames we keep showing it so the diff renders it as removed.
    const oldMiddle = before.slice(prefix, before.length - suffix);
    return { head, tail, newMiddle, oldMiddle };
  }, [before, after]);

  // `step` = how many chars of `newMiddle` are revealed. Counts up from a
  // NEGATIVE value: the negative span is the HOLD (still showing only old text).
  const [step, setStep] = useState<number>(() =>
    active ? -holdTicks * charsPerTick : region.newMiddle.length,
  );
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Effective per-tick chars so even a long replacement finishes within budget.
  const effectiveChars = useMemo(() => {
    const ticksAvailable = Math.max(1, Math.floor(budgetMs / intervalMs));
    return Math.max(charsPerTick, Math.ceil(region.newMiddle.length / ticksAvailable));
  }, [budgetMs, intervalMs, charsPerTick, region.newMiddle.length]);

  // Reset whenever a fresh reveal begins (new texts, replay, or (re)activation).
  useEffect(() => {
    setStep(active ? -holdTicks * charsPerTick : region.newMiddle.length);
  }, [active, replayKey, holdTicks, charsPerTick, region.newMiddle.length]);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!active) return;
    // Nothing to fill (identical or empty change) → no timer, settle at done.
    if (region.newMiddle.length === 0) {
      setStep(0);
      return;
    }

    timerRef.current = setInterval(() => {
      setStep((s) => {
        const next = s + effectiveChars;
        if (next >= region.newMiddle.length) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          return region.newMiddle.length;
        }
        return next;
      });
    }, intervalMs);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [active, replayKey, intervalMs, effectiveChars, region.newMiddle.length]);

  // Build this frame's `modified`. Clamp `step`: a negative step is the HOLD
  // (no new chars revealed yet, old middle still shown).
  const revealed = Math.max(0, Math.min(step, region.newMiddle.length));
  const inHold = step < 0;
  const filledNew = region.newMiddle.slice(0, revealed);
  // While filling, the UNrevealed remainder of the OLD middle stays visible so
  // the diff keeps rendering it as "removing" until the new text overtakes it.
  const remainingOld = region.oldMiddle.slice(
    Math.min(revealed, region.oldMiddle.length),
  );

  const modified = inHold
    ? // HOLD: show the doc exactly as it was — the removal span is highlighted
      // by the caller (phase === "hold"); the engine sees before===modified.
      before
    : region.head + filledNew + remainingOld + region.tail;

  const done =
    !active || (revealed >= region.newMiddle.length && region.newMiddle.length >= 0 && !inHold);
  const isRevealing = active && !done;
  const phase: DiffReveal["phase"] = !active
    ? "done"
    : inHold
      ? "hold"
      : revealed >= region.newMiddle.length
        ? "done"
        : "fill";

  return {
    before,
    // When settled, always return the exact final text (avoid float drift).
    modified: phase === "done" ? after : modified,
    isRevealing,
    phase,
  };
}
