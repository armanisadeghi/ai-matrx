"use client";

/**
 * THE metric-over-time chart (UI-SPEC §1.4) — one component for a post's
 * metric snapshots and an account's follower snapshots. Hand-drawn SVG like
 * `AnalyticsTrendChart` (no chart-library chunk in statically imported
 * chrome). `dataviz` rules: one axis (one unit), 2px line, recessive grid,
 * crosshair with an 8px hover marker, direct label on the last point, the
 * validated blue (`#3b82f6`) for the series and a dashed muted line for the
 * baseline. Gaps are drawn as gaps; one snapshot renders a point plus
 * `Tracking since <date>`; no snapshot renders nothing but the caption.
 *
 * Fixed aspect box: the chart reserves its height before data arrives, so
 * loading it never shifts the page.
 */

import { useState } from "react";

import { cn } from "@/lib/utils";

import { formatCompact } from "../outlier";
import type { SeriesPoint } from "../mappers";

const W = 720;
const H = 200;
const PAD = { top: 14, right: 56, bottom: 22, left: 44 };
const SERIES_COLOR = "#3b82f6";

const DAY_MS = 86_400_000;

/** Split points into runs; a gap wider than 3x the median interval breaks the line. */
export function contiguousRunSplit(points: readonly SeriesPoint[]): SeriesPoint[][] {
  if (points.length === 0) return [];
  const gaps = points.slice(1).map((p, i) => p.t - points[i]!.t).sort((a, b) => a - b);
  const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)]! : DAY_MS;
  const limit = Math.max(3 * medianGap, 2 * DAY_MS);
  const runs: SeriesPoint[][] = [[points[0]!]];
  for (let i = 1; i < points.length; i += 1) {
    if (points[i]!.t - points[i - 1]!.t > limit) runs.push([]);
    runs[runs.length - 1]!.push(points[i]!);
  }
  return runs;
}

function niceCeiling(value: number): number {
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 2.5, 5, 10]) {
    if (step * magnitude >= value) return step * magnitude;
  }
  return 10 * magnitude;
}

export interface MetricChartProps {
  points: readonly SeriesPoint[];
  /** Unit label for screen readers and tooltips, e.g. "Views". */
  label: string;
  /** Dashed baseline value (a post's creator-median-at-posting). */
  baseline?: number | null;
  /** When set, x is "since posted": ticks read hours/days after this epoch ms. */
  sinceMs?: number | null;
  className?: string;
}

function formatX(t: number, sinceMs: number | null | undefined): string {
  if (sinceMs) {
    const hours = (t - sinceMs) / 3_600_000;
    return hours < 48 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
  }
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function MetricChart({ points, label, baseline, sinceMs, className }: MetricChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className={cn("aspect-[720/200] w-full rounded-md border border-border", className)}>
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          No snapshots yet
        </div>
      </div>
    );
  }

  const tMin = points[0]!.t;
  const tMax = points[points.length - 1]!.t;
  const span = Math.max(tMax - tMin, 1);
  const maxValue = Math.max(...points.map((p) => p.value), baseline ?? 0);
  const yMax = niceCeiling(maxValue);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + (points.length === 1 ? plotW / 2 : ((t - tMin) / span) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;
  const runs = contiguousRunSplit(points);
  const last = points[points.length - 1]!;
  const hovered = hover !== null ? points[hover] : null;
  const ticks = [0, 0.5, 1].map((f) => f * yMax);

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${label} over time, ${points.length} snapshots`}
        className="block aspect-[720/200] w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          let best = 0;
          let bestDist = Infinity;
          points.forEach((p, i) => {
            const d = Math.abs(x(p.t) - px);
            if (d < bestDist) {
              bestDist = d;
              best = i;
            }
          });
          setHover(best);
        }}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              stroke="currentColor"
              className="text-border"
              strokeWidth={1}
            />
            <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" className="fill-muted-foreground" fontSize={10}>
              {formatCompact(v)}
            </text>
          </g>
        ))}
        {baseline != null && baseline > 0 ? (
          <g>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(baseline)}
              y2={y(baseline)}
              stroke="currentColor"
              className="text-muted-foreground"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <text x={W - PAD.right + 4} y={y(baseline) + 3} className="fill-muted-foreground" fontSize={10}>
              median
            </text>
          </g>
        ) : null}
        {runs.map((run, i) =>
          run.length > 1 ? (
            <polyline
              key={i}
              fill="none"
              stroke={SERIES_COLOR}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={run.map((p) => `${x(p.t)},${y(p.value)}`).join(" ")}
            />
          ) : null,
        )}
        {points.map((p, i) => (
          <circle key={i} cx={x(p.t)} cy={y(p.value)} r={points.length === 1 ? 4 : 2} fill={SERIES_COLOR} />
        ))}
        <text x={x(last.t) + 6} y={y(last.value) + 3} fontSize={10} className="fill-foreground">
          {formatCompact(last.value)}
        </text>
        <text x={PAD.left} y={H - 6} fontSize={10} className="fill-muted-foreground">
          {formatX(tMin, sinceMs)}
        </text>
        {points.length > 1 ? (
          <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize={10} className="fill-muted-foreground">
            {formatX(tMax, sinceMs)}
          </text>
        ) : null}
        {hovered ? (
          <g pointerEvents="none">
            <line
              x1={x(hovered.t)}
              x2={x(hovered.t)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="currentColor"
              className="text-muted-foreground"
              strokeWidth={1}
            />
            <circle cx={x(hovered.t)} cy={y(hovered.value)} r={5} fill={SERIES_COLOR} stroke="white" strokeWidth={2} />
          </g>
        ) : null}
      </svg>
      <p className="mt-0.5 flex h-4 items-center justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>
          {points.length === 1
            ? `Tracking since ${new Date(tMin).toLocaleDateString()}`
            : `Snapshots: ${points.length}`}
        </span>
        <span>
          {hovered
            ? `${label} ${hovered.value.toLocaleString()} · ${formatX(hovered.t, sinceMs)}`
            : ""}
        </span>
      </p>
    </div>
  );
}

/** CSV of the plotted series (the chart's export). */
export function seriesToCsv(label: string, points: readonly SeriesPoint[]): string {
  return [`observed_at,${label.toLowerCase()}`, ...points.map((p) => `${new Date(p.t).toISOString()},${p.value}`)].join("\n");
}
