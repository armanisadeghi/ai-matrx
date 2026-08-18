"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { scoreTone, type ReadinessSegment } from "../lib/desk";

const FILL: Record<ReturnType<typeof scoreTone>, string> = {
  strong: "bg-emerald-500 dark:bg-emerald-400",
  fair: "bg-amber-500 dark:bg-amber-400",
  weak: "bg-muted-foreground/45",
};

/**
 * FOUR 0–100 numbers per row is noise, so the desk never prints four numbers
 * in a row. It prints ONE four-bar meter — a shape the eye reads in a glance
 * ("tall, tall, short, tall" = strong story we cannot prove yet) — and keeps
 * the exact values one hover away and permanently visible in the brief, where
 * the decision is actually made.
 *
 * `priority`, the fifth score, is deliberately NOT a bar: it is the row's
 * position in the queue and the number in its rank chip.
 */
export function ReadinessMeter({
  segments,
  size = "row",
  className,
}: {
  segments: ReadinessSegment[];
  size?: "row" | "rail";
  className?: string;
}) {
  const label = segments
    .map((segment) => `${segment.label} ${segment.value} of 100`)
    .join(", ");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={`Readiness: ${label}`}
          className={cn(
            "flex shrink-0 items-end gap-[3px]",
            size === "row" ? "h-5" : "h-4",
            className,
          )}
        >
          {segments.map((segment) => {
            const height = Math.max(8, Math.min(100, segment.value));
            return (
              <span
                key={segment.key}
                className={cn(
                  "relative flex h-full w-[5px] items-end overflow-hidden rounded-[2px] bg-foreground/10",
                )}
              >
                <span
                  className={cn(
                    "w-full rounded-[2px] transition-[height] duration-300",
                    FILL[scoreTone(segment.value)],
                  )}
                  style={{ height: `${height}%` }}
                />
              </span>
            );
          })}
        </span>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-72 p-0">
        <ul className="divide-y divide-border/60">
          {segments.map((segment) => (
            <li key={segment.key} className="px-3 py-1.5">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-xs font-medium text-foreground">
                  {segment.label}
                </span>
                <span className="text-xs font-semibold tabular-nums text-foreground">
                  {segment.value}
                  <span className="text-muted-foreground">/100</span>
                </span>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {segment.meaning}
              </p>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

/** The single-value variant — a journalist request has one score, not four. */
export function MatchMeter({
  value,
  reason,
  className,
}: {
  value: number;
  reason: string | null;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={`Match ${value} of 100 against this business`}
          className={cn("flex h-5 w-11 shrink-0 items-center", className)}
        >
          <span className="relative h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
            <span
              className={cn(
                "absolute inset-y-0 left-0 rounded-full",
                FILL[scoreTone(value)],
              )}
              style={{ width: `${Math.max(4, Math.min(100, value))}%` }}
            />
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-72">
        <p className="text-xs font-semibold text-foreground">
          Match {value}/100
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {reason ?? "No match reason was recorded for this request."}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The proof pips — `proof_required` rendered as filled/hollow dots. Deliberately
 * NOT red: an unproven angle is a to-do, so the unmet pips are simply unfilled.
 */
export function ProofPips({
  met,
  total,
  className,
}: {
  met: number;
  total: number;
  className?: string;
}) {
  if (total === 0) {
    return (
      <span
        className={cn(
          "text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70",
          className,
        )}
      >
        no proof list
      </span>
    );
  }
  const shown = Math.min(total, 6);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn("flex shrink-0 items-center gap-1", className)}
          aria-label={`${met} of ${total} proofs in hand`}
        >
          <span className="flex items-center gap-[3px]">
            {Array.from({ length: shown }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  index < met
                    ? "bg-primary"
                    : "border border-primary/40 bg-transparent",
                )}
              />
            ))}
          </span>
          <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
            {met}/{total}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="left">
        <p className="text-xs">
          {met === total
            ? "Every proof a newsroom would ask for is in hand."
            : `${total - met} more ${total - met === 1 ? "fact" : "facts"} and this is pitchable.`}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
