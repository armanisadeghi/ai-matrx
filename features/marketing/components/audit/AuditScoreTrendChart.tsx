"use client";

import type { AuditTrendPoint } from "@/features/marketing/lib/audit-rollup";
import { formatCompactDate } from "@/features/marketing/components/shared/MarketingUi";

/**
 * Site audit score trend (M-55) — inline SVG line chart, same house style
 * as `ranks/RankSparkline.tsx`. Score is the composite pass rate (0-100%)
 * across the 4 audit sections, one point per real capture day.
 */
export function AuditScoreTrendChart({
  points,
  height = 120,
}: {
  points: AuditTrendPoint[];
  height?: number;
}) {
  const scored = points.filter(
    (p): p is AuditTrendPoint & { overallScore: number } =>
      p.overallScore !== null,
  );

  if (scored.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground"
        style={{ height }}
      >
        No historical audit captures yet — score trend appears once the
        site has been crawled or fetched on more than one day.
      </div>
    );
  }

  const width = 560;
  const paddingX = 8;
  const paddingY = 12;
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;

  const xFor = (index: number) =>
    scored.length === 1
      ? paddingX + usableWidth / 2
      : paddingX + (index / (scored.length - 1)) * usableWidth;
  const yFor = (score: number) =>
    paddingY + ((100 - score) / 100) * usableHeight;

  const path = scored
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.overallScore).toFixed(1)}`,
    )
    .join(" ");

  const last = scored[scored.length - 1];
  const tone =
    last.overallScore >= 90
      ? "text-success"
      : last.overallScore >= 60
        ? "text-warning"
        : "text-destructive";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={tone}
      role="img"
      aria-label="Site audit score over time"
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
      {scored.map((p, i) => (
        <circle
          key={p.day}
          cx={xFor(i)}
          cy={yFor(p.overallScore)}
          r={i === scored.length - 1 ? 3 : 1.75}
          fill="currentColor"
        />
      ))}
      <text x={width - paddingX} y={paddingY - 2} textAnchor="end" className="fill-muted-foreground text-[9px]">
        100%
      </text>
      <text x={width - paddingX} y={height - 2} textAnchor="end" className="fill-muted-foreground text-[9px]">
        0%
      </text>
      <text
        x={xFor(scored.length - 1)}
        y={yFor(last.overallScore) - 6}
        textAnchor="end"
        className="fill-foreground text-[10px] font-medium"
      >
        {last.overallScore}%
      </text>
      <text x={paddingX} y={height - 2} textAnchor="start" className="fill-muted-foreground text-[9px]">
        {formatCompactDate(scored[0].day)} – {formatCompactDate(last.day)}
      </text>
    </svg>
  );
}
