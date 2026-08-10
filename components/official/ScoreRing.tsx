"use client";

import { cn } from "@/lib/utils";

export interface ScoreThresholds {
  /** Scores at or above this value are green. */
  good: number;
  /** Scores at or above this value (but below good) are orange. */
  warning: number;
}

export const DEFAULT_SCORE_THRESHOLDS: ScoreThresholds = {
  good: 75,
  warning: 50,
};

/** Semantic score color shared by ring and accent consumers. */
export function scoreRingColorClasses(
  pct: number | null,
  thresholds: ScoreThresholds = DEFAULT_SCORE_THRESHOLDS,
): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= thresholds.good) return "text-green-500";
  if (pct >= thresholds.warning) return "text-orange-500";
  return "text-red-500";
}

/** Solid-background twin of `scoreRingColorClasses`. */
export function scoreAccentBgClasses(
  pct: number | null,
  thresholds: ScoreThresholds = DEFAULT_SCORE_THRESHOLDS,
): string {
  if (pct === null) return "bg-muted-foreground/30";
  if (pct >= thresholds.good) return "bg-green-500";
  if (pct >= thresholds.warning) return "bg-orange-500";
  return "bg-red-500";
}

/**
 * Shared SVG score ring. `pct` is 0–100; threshold semantics are supplied by
 * the domain (for example Lighthouse uses 90/50 while study uses 75/50).
 */
export function ScoreRing({
  pct,
  size = 112,
  strokeWidth = 8,
  label,
  valueClassName,
  className,
  thresholds = DEFAULT_SCORE_THRESHOLDS,
  suffix = "%",
}: {
  pct: number | null;
  size?: number;
  strokeWidth?: number;
  label?: string;
  valueClassName?: string;
  className?: string;
  thresholds?: ScoreThresholds;
  /** Visible suffix; study keeps `%`, while Lighthouse convention omits it. */
  suffix?: string;
}) {
  const radius = 50 - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const boundedPct = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  const dashOffset = circumference * (1 - boundedPct / 100);

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center",
        className,
      )}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label ?? "Score"}: ${pct === null ? "not available" : `${pct} out of 100`}`}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={radius}
          className="stroke-muted"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {pct !== null ? (
          <circle
            cx="50"
            cy="50"
            r={radius}
            className={cn(
              "transition-[stroke-dashoffset] duration-700 ease-out",
              scoreRingColorClasses(pct, thresholds),
            )}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        ) : null}
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span
          className={cn(
            "font-bold tabular-nums text-foreground",
            valueClassName ?? "text-2xl",
          )}
        >
          {pct === null ? "—" : `${pct}${suffix}`}
        </span>
        {label ? (
          <span className="max-w-[74px] truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
        ) : null}
      </div>
    </div>
  );
}
