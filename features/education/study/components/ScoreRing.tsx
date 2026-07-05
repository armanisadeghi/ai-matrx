"use client";

// features/education/study/components/ScoreRing.tsx
//
// Shared animated SVG score ring — one implementation for both the session
// scorecard (large, headline) and the sessions history list (small, per-row).
// `pct` is 0-100 or null (nothing graded yet — renders an empty track + "—").

import { cn } from "@/lib/utils";

/** Color scale shared by every score-ring consumer, so a 72% always reads the same. */
export function scoreRingColorClasses(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 75) return "text-green-500";
  if (pct >= 50) return "text-amber-500";
  return "text-red-500";
}

/** Same tiers as `scoreRingColorClasses`, as a solid `bg-*` — for an accent bar/dot. */
export function scoreAccentBgClasses(pct: number | null): string {
  if (pct === null) return "bg-muted-foreground/30";
  if (pct >= 75) return "bg-green-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-red-500";
}

export function ScoreRing({
  pct,
  size = 112,
  strokeWidth = 8,
  label,
  valueClassName,
  className,
}: {
  pct: number | null;
  /** Ring diameter in px. */
  size?: number;
  strokeWidth?: number;
  /** Small caption under the percentage, e.g. "Score" — omit for a compact ring. */
  label?: string;
  valueClassName?: string;
  className?: string;
}) {
  const radius = 50 - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - (pct ?? 0) / 100);

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center",
        className,
      )}
      style={{ width: size, height: size }}
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
        {pct !== null && (
          <circle
            cx="50"
            cy="50"
            r={radius}
            className={cn(
              "transition-[stroke-dashoffset] duration-700 ease-out",
              scoreRingColorClasses(pct),
            )}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        )}
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span
          className={cn(
            "font-bold tabular-nums text-foreground",
            valueClassName ?? "text-2xl",
          )}
        >
          {pct === null ? "—" : `${pct}%`}
        </span>
        {label && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
