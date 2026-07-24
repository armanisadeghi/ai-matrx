"use client";

import type { RankTargetHistoryPoint } from "./types";

/** Minimal inline SVG line chart: organic position over time (lower = better,
 * so the y-axis is inverted — rank 1 renders at the top). No charting
 * library dependency; this is a small embedded card visual, not a
 * standalone artifact. */
export function RankSparkline({
  points,
  height = 120,
}: {
  points: RankTargetHistoryPoint[];
  height?: number;
}) {
  const ranked = points.filter((p) => p.organic_rank !== null) as (RankTargetHistoryPoint & {
    organic_rank: number;
  })[];

  if (ranked.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground"
        style={{ height }}
      >
        No ranked observations yet.
      </div>
    );
  }

  const width = 560;
  const paddingX = 8;
  const paddingY = 12;
  const worst = Math.max(...ranked.map((p) => p.organic_rank), 20);
  const best = 1;
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;

  const xFor = (index: number) =>
    ranked.length === 1
      ? paddingX + usableWidth / 2
      : paddingX + (index / (ranked.length - 1)) * usableWidth;
  const yFor = (rank: number) =>
    paddingY + ((rank - best) / Math.max(worst - best, 1)) * usableHeight;

  const path = ranked
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.organic_rank).toFixed(1)}`)
    .join(" ");

  const last = ranked[ranked.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full text-primary"
      role="img"
      aria-label="Rank position over time"
    >
      <line
        x1={paddingX}
        y1={paddingY}
        x2={width - paddingX}
        y2={paddingY}
        stroke="currentColor"
        strokeOpacity={0.15}
        strokeDasharray="2 3"
      />
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.75} />
      {ranked.map((p, i) => (
        <circle
          key={p.observed_at}
          cx={xFor(i)}
          cy={yFor(p.organic_rank)}
          r={i === ranked.length - 1 ? 3 : 1.75}
          fill="currentColor"
        />
      ))}
      <text
        x={width - paddingX}
        y={paddingY - 2}
        textAnchor="end"
        className="fill-muted-foreground text-[9px]"
      >
        #1
      </text>
      <text
        x={width - paddingX}
        y={height - 2}
        textAnchor="end"
        className="fill-muted-foreground text-[9px]"
      >
        #{worst}
      </text>
      <text
        x={xFor(ranked.length - 1)}
        y={yFor(last.organic_rank) - 6}
        textAnchor="end"
        className="fill-foreground text-[10px] font-medium"
      >
        #{last.organic_rank}
      </text>
    </svg>
  );
}
