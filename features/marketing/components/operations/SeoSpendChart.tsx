"use client";

import type { SeoDailySpendPoint } from "@/features/marketing/data/spend";
import { formatCompactDate } from "@/features/marketing/components/shared/MarketingUi";
import { formatRuntimeCost } from "@/features/marketing/data/operations-format";

/**
 * 30-day daily SEO provider spend — inline SVG, same house style as
 * `backlinks/BacklinkTrendChart.tsx` / `ranks/RankSparkline.tsx`. No
 * charting library.
 */
export function SeoSpendChart({
  points,
  height = 140,
}: {
  points: SeoDailySpendPoint[];
  height?: number;
}) {
  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground"
        style={{ height }}
      >
        No SEO provider spend in the last 30 days.
      </div>
    );
  }

  const width = 720;
  const paddingX = 10;
  const paddingTop = 10;
  const paddingBottom = 18;
  const usableHeight = height - paddingTop - paddingBottom;
  const usableWidth = width - paddingX * 2;
  const maxCost = Math.max(0.01, ...points.map((p) => p.effective_cost));
  const slot = usableWidth / points.length;
  const barWidth = Math.max(2, Math.min(20, slot * 0.6));
  const xFor = (index: number) => paddingX + slot * index + slot / 2;
  const heightFor = (value: number) => (value / maxCost) * usableHeight;

  const first = points[0];
  const last = points[points.length - 1];
  const total = points.reduce((sum, p) => sum + p.effective_cost, 0);

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Daily SEO provider spend over the last 30 days"
      >
        <line
          x1={paddingX}
          y1={paddingTop + usableHeight}
          x2={width - paddingX}
          y2={paddingTop + usableHeight}
          stroke="currentColor"
          strokeOpacity={0.15}
          className="text-muted-foreground"
        />
        {points.map((point) => {
          const index = points.indexOf(point);
          const x = xFor(index);
          const barHeight = heightFor(point.effective_cost);
          return (
            <rect
              key={point.date}
              x={x - barWidth / 2}
              y={paddingTop + usableHeight - barHeight}
              width={barWidth}
              height={barHeight}
              className="fill-primary"
              opacity={point.effective_cost > 0 ? 0.75 : 0.15}
            >
              <title>
                {point.date}: {formatRuntimeCost(point.effective_cost)} ({point.run_count} run
                {point.run_count === 1 ? "" : "s"})
              </title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{formatCompactDate(first.date)}</span>
        <span>
          {formatRuntimeCost(total)} total over {points.length} day
          {points.length === 1 ? "" : "s"}
        </span>
        <span>{formatCompactDate(last.date)}</span>
      </div>
    </div>
  );
}
