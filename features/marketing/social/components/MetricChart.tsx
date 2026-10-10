"use client";

/**
 * THE metric-over-time chart (UI-SPEC §1.4) — one component for a post's
 * metric snapshots and an account's follower snapshots. Hand-drawn SVG like
 * `AnalyticsTrendChart` (no chart-library chunk in statically imported
 * chrome). `dataviz` rules: one axis (one unit), 2px line, recessive grid,
 * crosshair with an 8px hover marker, direct label on the last point, the
 * validated blue (`#3b82f6`) for the series and a dashed muted line for the
 * baseline. Gaps are drawn as gaps; readings on fewer than two days draw no chart at all
 * (a line needs two points): the figure shows as a tile with `Tracking since <date>`.
 *
 * Fixed aspect box: the chart reserves its height before data arrives, so
 * loading it never shifts the page.
 */

import { useEffect, useRef, useState } from "react";

import { KpiTile } from "@/components/official/kpi/KpiTile";
import { cn } from "@/lib/utils";

import { formatCompact } from "../outlier";
import { formatDay, type SeriesPoint } from "../mappers";

/** Drawn at the width it is shown, so 12px text is 12px on screen (a scaled viewBox shrank it to ~5px). */
const DEFAULT_W = 720;
const H = 190;
const PAD = { top: 14, right: 52, bottom: 26, left: 48 };
const FONT = 12;

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(DEFAULT_W);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(Math.max(240, Math.round(el.getBoundingClientRect().width)));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
const SERIES_COLOR = "#3b82f6";

const DAY_MS = 86_400_000;

/** Split points into runs; a gap wider than 3x the median interval breaks the line. */
export function contiguousRunSplit(points: readonly SeriesPoint[]): SeriesPoint[][] {
  if (points.length === 0) return [];
  const gaps = points
    .slice(1)
    .map((p, i) => p.t - points[i]!.t)
    .sort((a, b) => a - b);
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

function formatX(t: number, sinceMs: number | null | undefined, spanMs = Infinity): string {
  if (sinceMs) {
    const hours = (t - sinceMs) / 3_600_000;
    return hours < 48 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
  }
  // Inside two days a bare date repeats ("Oct 9 Oct 9"): say the time instead.
  if (spanMs < 2 * DAY_MS)
    return new Date(t).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  return new Date(t).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function MetricChart({ points, label, baseline, sinceMs, className }: MetricChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [boxRef, W] = useWidth();

  if (points.length === 0) {
    return (
      <div className={cn("flex h-24 w-full items-center justify-center rounded-md border border-border", className)}>
        <div className="text-xs text-muted-foreground">No snapshots yet</div>
      </div>
    );
  }
  // A line needs readings on at least two different days; until then the figure stands as a tile.
  if (points[points.length - 1]!.t - points[0]!.t < DAY_MS) {
    const only = points[points.length - 1]!;
    return (
      <KpiTile
        label={label}
        value={only.value.toLocaleString()}
        hint={`Tracking since ${formatDay(points[0]!.t)}`}
        className={className}
      />
    );
  }

  const tMin = points[0]!.t;
  const tMax = points[points.length - 1]!.t;
  const span = Math.max(tMax - tMin, 1);
  const maxValue = Math.max(...points.map((p) => p.value), baseline ?? 0);
  const yMax = niceCeiling(maxValue);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - tMin) / span) * plotW;
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;
  const runs = contiguousRunSplit(points);
  const last = points[points.length - 1]!;
  const hovered = hover !== null ? points[hover] : null;
  const ticks = [0, 0.5, 1].map((f) => f * yMax);
  // Up to four evenly spaced x labels, dropping any that repeat their neighbour.
  const xTicks = [0, 1 / 3, 2 / 3, 1]
    .map((f) => tMin + f * span)
    .map((t) => ({ t, text: formatX(t, sinceMs, span) }))
    .filter((tick, i, all) => i === 0 || tick.text !== all[i - 1]!.text);

  return (
    <div ref={boxRef} className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${label} over time, ${points.length} snapshots`}
        className="block w-full"
        style={{ height: H }}
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
            <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" className="fill-muted-foreground" fontSize={FONT}>
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
            <text x={W - PAD.right + 4} y={y(baseline) + 3} className="fill-muted-foreground" fontSize={FONT}>
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
        <text x={x(last.t) + 6} y={y(last.value) + 3} fontSize={FONT} className="fill-foreground">
          {formatCompact(last.value)}
        </text>
        {xTicks.map((tick, i) => (
          <text
            key={tick.t}
            x={x(tick.t)}
            y={H - 8}
            textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
            fontSize={FONT}
            className="fill-muted-foreground"
          >
            {tick.text}
          </text>
        ))}
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
      <p className="mt-0.5 flex h-5 items-center justify-between text-xs tabular-nums text-muted-foreground">
        <span>{`Tracking since ${formatDay(tMin)}`}</span>
        <span>
          {hovered ? `${label} ${hovered.value.toLocaleString()} · ${formatX(hovered.t, sinceMs, span)}` : ""}
        </span>
      </p>
    </div>
  );
}

/** CSV of the plotted series (the chart's export). */
export function seriesToCsv(label: string, points: readonly SeriesPoint[]): string {
  return [`observed_at,${label.toLowerCase()}`, ...points.map((p) => `${new Date(p.t).toISOString()},${p.value}`)].join(
    "\n",
  );
}
