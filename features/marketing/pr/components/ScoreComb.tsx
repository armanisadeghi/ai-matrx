"use client";

/**
 * The answer to "five 0–100 numbers per row will look like noise".
 *
 * ONE headline number the user can sort a day's work by, and a five-bar COMB
 * beside it — a shape the eye compares across twenty rows in one sweep without
 * reading a digit. All five stored scores are on the comb, `evidence_quality`
 * included, so nothing on the row is hidden.
 *
 * The footprint is fixed in BOTH dimensions and the digits are tabular, so a
 * queue re-sorting or a score changing can never move a row a pixel.
 *
 * THIS RENDERS INSIDE THE ROW'S `<button>`, so it is PHRASING content only and
 * carries NO interactive element of its own. It used to hang a Radix tooltip
 * off a `<div role="img">` in there — a div inside a button (invalid content
 * model) that no keyboard could ever reach, which made the five-score
 * breakdown a mouse-only door. It is now purely decorative: `aria-hidden`
 * visuals plus one short `sr-only` sentence, and `title` for the hover
 * convenience. **`ScoreBreakdown` in the expanded row is THE accessible source
 * of the five axes** — labelled, weighted, in the open, and reachable by the
 * same Enter that opens the row. A hover was never a door on a touch screen
 * either. The weighting is declared and un-configurable (see `scoring.ts`): a
 * readiness number the user can tune is a number they can no longer compare
 * between angles.
 */

import { cn } from "@/lib/utils";
import {
  SCORE_MODEL,
  pitchReadiness,
  scoreTone,
  scoreValue,
  weakestAxis,
  type ScoreTone,
} from "@/features/marketing/pr/scoring";
import type { StoryAngle } from "@/features/marketing/pr/types";

const TONE_TEXT: Record<ScoreTone, string> = {
  strong: "text-emerald-600 dark:text-emerald-400",
  fair: "text-amber-600 dark:text-amber-400",
  weak: "text-muted-foreground",
};

const TONE_BAR: Record<ScoreTone, string> = {
  strong: "bg-emerald-500/80",
  fair: "bg-amber-500/80",
  weak: "bg-muted-foreground/40",
};

/** The comb itself: five bars, fixed box, no digits. */
function Comb({ angle, className }: { angle: StoryAngle; className?: string }) {
  return (
    <span
      className={cn("flex h-6 w-[27px] shrink-0 items-end gap-[3px]", className)}
      aria-hidden
    >
      {SCORE_MODEL.map((spec) => {
        const value = scoreValue(angle, spec.key);
        return (
          <span
            key={spec.key}
            className="relative h-full w-[3px] overflow-hidden rounded-[2px] bg-muted"
          >
            <span
              className={cn(
                "absolute inset-x-0 bottom-0 rounded-[2px]",
                TONE_BAR[scoreTone(value)],
              )}
              style={{ height: `${Math.max(8, value)}%` }}
            />
          </span>
        );
      })}
    </span>
  );
}

export function ScoreComb({
  angle,
  className,
}: {
  angle: StoryAngle;
  className?: string;
}) {
  const readiness = pitchReadiness(angle);
  const tone = scoreTone(readiness);
  const summary = SCORE_MODEL.map(
    (spec) => `${spec.label} ${scoreValue(angle, spec.key)}`,
  ).join(", ");

  return (
    <span
      className={cn(
        "flex w-[74px] shrink-0 items-center justify-end gap-2",
        className,
      )}
      // The hover convenience, on an attribute instead of a nested trigger —
      // no extra element, no invalid nesting, and it survives inside a button.
      title={`Pitch readiness ${readiness}/100 — a weighted blend of four signals. ${summary}. Priority is on the comb but weighs nothing here: it sets the ORDER of the queue, not the readiness. Open the row for the weighted breakdown.`}
    >
      {/* One SHORT sentence into the row button's accessible name. The five
          axes belong to the expanded row, which the same button opens —
          repeating them here would bury the headline in every row. */}
      <span className="sr-only">
        Pitch readiness {readiness} out of 100.
      </span>
      <Comb angle={angle} />
      <span
        aria-hidden
        className={cn(
          "w-9 text-right text-lg font-semibold leading-none tabular-nums",
          TONE_TEXT[tone],
        )}
      >
        {readiness}
      </span>
    </span>
  );
}

/** The same five signals, opened out — for the expanded row. */
export function ScoreBreakdown({ angle }: { angle: StoryAngle }) {
  const weakest = weakestAxis(angle);
  const weakestValue = scoreValue(angle, weakest.key);
  return (
    <div className="space-y-1.5">
      <dl className="space-y-1.5">
        {SCORE_MODEL.map((spec) => {
          const value = scoreValue(angle, spec.key);
          const tone = scoreTone(value);
          return (
            <div key={spec.key} className="flex items-center gap-2">
              <dt className="w-[72px] shrink-0 text-[11px] font-medium text-muted-foreground">
                {spec.label}
              </dt>
              <dd className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn("block h-full rounded-full", TONE_BAR[tone])}
                  style={{ width: `${value}%` }}
                />
              </dd>
              <dd
                className={cn(
                  "w-7 text-right text-[11px] font-semibold tabular-nums",
                  TONE_TEXT[tone],
                )}
              >
                {value}
              </dd>
              <dd className="w-[62px] shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/80">
                {spec.weight > 0 ? `×${spec.weight.toFixed(2)}` : "order only"}
              </dd>
            </div>
          );
        })}
      </dl>
      {/* ONE sentence, from the axis actually holding this angle back — five
          explanations under five bars would be the noise we just removed. */}
      <p className="pt-0.5 text-[10px] leading-4 text-muted-foreground">
        {weakestValue >= 70 ? weakest.high : weakest.low}
      </p>
    </div>
  );
}
