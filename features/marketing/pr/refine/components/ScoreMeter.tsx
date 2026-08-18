"use client";

/**
 * The answer to "four 0–100 numbers per row will look like noise".
 *
 * ONE headline number the user can sort a day's work by, and a fixed-footprint
 * four-bar meter that keeps the parts visible without asking anyone to read
 * four numbers. Hover gives the full breakdown with the weights; the expanded
 * row gives it again as labelled bars, so nothing is only-behind-a-hover (a
 * hover is not a door on a touch screen).
 *
 * The footprint is fixed in BOTH dimensions and the digits are tabular, so a
 * queue re-sorting or a score changing can never move a row a pixel.
 */

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  pitchReadiness,
  scoreParts,
  scoreTone,
  type ScorePart,
} from "@/features/marketing/pr/refine/scoring";
import type { StoryAngle } from "@/features/marketing/pr/refine/types";

const TONE_TEXT = {
  strong: "text-emerald-600 dark:text-emerald-400",
  fair: "text-amber-600 dark:text-amber-400",
  weak: "text-muted-foreground",
} as const;

const TONE_BAR = {
  strong: "bg-emerald-500/80",
  fair: "bg-amber-500/80",
  weak: "bg-muted-foreground/40",
} as const;

function Bars({ parts, className }: { parts: ScorePart[]; className?: string }) {
  return (
    <div
      className={cn("flex h-6 w-9 shrink-0 items-end gap-[3px]", className)}
      aria-hidden
    >
      {parts.map((part) => (
        <div
          key={part.key}
          className="relative h-full flex-1 overflow-hidden rounded-[2px] bg-muted"
        >
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 rounded-[2px]",
              TONE_BAR[scoreTone(part.value)],
            )}
            style={{ height: `${Math.max(6, part.value)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export function ScoreMeter({
  angle,
  className,
}: {
  angle: StoryAngle;
  className?: string;
}) {
  const parts = scoreParts(angle);
  const readiness = pitchReadiness(angle);
  const tone = scoreTone(readiness);
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex w-[86px] shrink-0 items-center justify-end gap-2",
            className,
          )}
          // The number is the information; the label makes it readable to a
          // screen reader without inventing a second visual element.
          role="img"
          aria-label={`Pitch readiness ${readiness} out of 100. ${parts
            .map((part) => `${part.label} ${part.value}`)
            .join(", ")}.`}
        >
          <Bars parts={parts} />
          <span
            className={cn(
              "w-9 text-right text-lg font-semibold leading-none tabular-nums",
              TONE_TEXT[tone],
            )}
          >
            {readiness}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-xs px-3 py-2">
        <p className="text-xs font-semibold text-foreground">
          Pitch readiness {readiness}/100
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          A weighted blend of four signals. Priority sets the order of the
          queue; readiness says whether this one is ready to leave the building.
        </p>
        <dl className="mt-2 space-y-1">
          {parts.map((part) => (
            <div key={part.key} className="flex items-baseline gap-2">
              <dt className="w-20 shrink-0 text-[11px] text-muted-foreground">
                {part.label}
              </dt>
              <dd
                className={cn(
                  "w-8 text-right text-[11px] font-semibold tabular-nums",
                  TONE_TEXT[scoreTone(part.value)],
                )}
              >
                {part.value}
              </dd>
              <dd className="text-[10px] text-muted-foreground">
                ×{part.weight.toFixed(2)}
              </dd>
            </div>
          ))}
        </dl>
      </TooltipContent>
    </Tooltip>
  );
}

/** The same four signals, opened out — for the expanded row. */
export function ScoreBreakdown({ angle }: { angle: StoryAngle }) {
  const parts = scoreParts(angle);
  return (
    <dl className="space-y-2">
      {parts.map((part) => (
        <div key={part.key} className="min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-[11px] font-medium text-foreground">
              {part.label}
            </dt>
            <dd
              className={cn(
                "text-[11px] font-semibold tabular-nums",
                TONE_TEXT[scoreTone(part.value)],
              )}
            >
              {part.value}
            </dd>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full",
                TONE_BAR[scoreTone(part.value)],
              )}
              style={{ width: `${part.value}%` }}
            />
          </div>
          <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
            {part.meaning}
          </p>
        </div>
      ))}
    </dl>
  );
}
