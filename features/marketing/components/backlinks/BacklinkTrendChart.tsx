"use client";

import type { BacklinkTrendPoint } from "@/features/marketing/data/backlinks-types";
import { formatCompactDate } from "@/features/marketing/components/shared/MarketingUi";

/**
 * New/lost backlink trend (M-61) — inline SVG, no charting library, same
 * house style as `ranks/RankSparkline.tsx`. Green bars for new links, red
 * bars for lost links (mirrored below the axis), plus a net line overlaid
 * on a secondary scale so a shrinking/growing profile reads at a glance.
 */
export function BacklinkTrendChart({
  points,
  height = 160,
}: {
  points: BacklinkTrendPoint[];
  height?: number;
}) {
  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground"
        style={{ height }}
      >
        No backlink history stored yet — run a weekly or full-bootstrap refresh
        to collect it.
      </div>
    );
  }

  const width = 720;
  const paddingX = 10;
  const paddingTop = 14;
  const paddingBottom = 18;
  const axisY = paddingTop + (height - paddingTop - paddingBottom) / 2;
  const usableWidth = width - paddingX * 2;
  const halfHeight = (height - paddingTop - paddingBottom) / 2;

  const maxMagnitude = Math.max(
    1,
    ...points.map((p) => Math.abs(p.new_backlinks ?? 0)),
    ...points.map((p) => Math.abs(p.lost_backlinks ?? 0)),
  );

  const slot = points.length > 0 ? usableWidth / points.length : usableWidth;
  const barWidth = Math.max(2, Math.min(18, slot * 0.6));
  const xFor = (index: number) => paddingX + slot * index + slot / 2;
  const barHeightFor = (value: number) =>
    (Math.abs(value) / maxMagnitude) * (halfHeight - 4);

  const netValues = points.map((p) => p.net_backlinks ?? 0);
  const maxNet = Math.max(1, ...netValues.map((v) => Math.abs(v)));
  const netYFor = (value: number) =>
    axisY - (value / maxNet) * (halfHeight - 4);
  const netPath = points
    .map((p, i) => {
      const x = xFor(i);
      const y = netYFor(p.net_backlinks ?? 0);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const first = points[0];
  const last = points[points.length - 1];
  const totalNew = points.reduce((sum, p) => sum + (p.new_backlinks ?? 0), 0);
  const totalLost = points.reduce((sum, p) => sum + (p.lost_backlinks ?? 0), 0);

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="New and lost backlinks over time"
      >
        <line
          x1={paddingX}
          y1={axisY}
          x2={width - paddingX}
          y2={axisY}
          stroke="currentColor"
          strokeOpacity={0.15}
          className="text-muted-foreground"
        />
        {points.map((p, i) => {
          const x = xFor(i);
          const newHeight = barHeightFor(p.new_backlinks ?? 0);
          const lostHeight = barHeightFor(p.lost_backlinks ?? 0);
          return (
            <g key={p.observed_at}>
              {p.new_backlinks ? (
                <rect
                  x={x - barWidth / 2}
                  y={axisY - newHeight}
                  width={barWidth}
                  height={newHeight}
                  className="fill-success"
                  opacity={0.75}
                />
              ) : null}
              {p.lost_backlinks ? (
                <rect
                  x={x - barWidth / 2}
                  y={axisY}
                  width={barWidth}
                  height={lostHeight}
                  className="fill-destructive"
                  opacity={0.75}
                />
              ) : null}
            </g>
          );
        })}
        <path
          d={netPath}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="text-primary"
        />
        {points.map((p, i) => (
          <circle
            key={`net-${p.observed_at}`}
            cx={xFor(i)}
            cy={netYFor(p.net_backlinks ?? 0)}
            r={i === points.length - 1 ? 2.5 : 1.25}
            className="fill-primary"
          />
        ))}
      </svg>
      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatCompactDate(first.observed_at)}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-success" /> +
            {totalNew.toLocaleString()} new
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-destructive" /> -
            {totalLost.toLocaleString()} lost
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-primary" /> net line
          </span>
        </span>
        <span>{formatCompactDate(last.observed_at)}</span>
      </div>
    </div>
  );
}
