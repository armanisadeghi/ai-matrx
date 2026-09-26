"use client";

/**
 * ReliabilityCurve — stated probability (x) against how often it was right (y).
 *
 * One series, so no legend: the dashed diagonal is perfect calibration, each
 * dot is one bin, its area is how many labeled answers fell in it. A dot below
 * the line is over-confident. Hover a dot for its numbers.
 */

import { useState } from "react";

export interface CurveBin {
  lower: number;
  upper: number;
  count: number;
  mean_predicted: number;
  observed_accuracy: number;
  gap: number;
}

const W = 320;
const H = 320;
const PAD = { left: 40, right: 12, top: 12, bottom: 34 };
const PW = W - PAD.left - PAD.right;
const PH = H - PAD.top - PAD.bottom;
const x = (v: number) => PAD.left + v * PW;
const y = (v: number) => PAD.top + (1 - v) * PH;
const TICKS = [0, 0.25, 0.5, 0.75, 1];

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function ReliabilityCurve({ bins, threshold }: { bins: CurveBin[]; threshold: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const radius = (count: number) => 4 + 8 * Math.sqrt(count / maxCount);
  const active = hover != null ? bins[hover] : null;

  return (
    <div className="relative w-full max-w-[22rem]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Reliability curve">
        {TICKS.map((t) => (
          <g key={t}>
            <line x1={x(0)} x2={x(1)} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
              {pct(t)}
            </text>
            <text x={x(t)} y={H - PAD.bottom + 14} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {pct(t)}
            </text>
          </g>
        ))}
        <text x={PAD.left + PW / 2} y={H - 4} textAnchor="middle" className="fill-muted-foreground text-[10px]">
          Stated probability
        </text>
        <text
          x={10}
          y={PAD.top + PH / 2}
          textAnchor="middle"
          transform={`rotate(-90 10 ${PAD.top + PH / 2})`}
          className="fill-muted-foreground text-[10px]"
        >
          Right this often
        </text>
        <line
          x1={x(0)}
          y1={y(0)}
          x2={x(1)}
          y2={y(1)}
          className="stroke-muted-foreground"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        {threshold != null && (
          <line
            x1={x(threshold)}
            x2={x(threshold)}
            y1={y(0)}
            y2={y(1)}
            className="stroke-foreground/40"
            strokeWidth={1}
          >
            <title>{`Recommended threshold ${pct(threshold)}`}</title>
          </line>
        )}
        {bins.length > 1 && (
          <polyline
            points={bins.map((b) => `${x(b.mean_predicted)},${y(b.observed_accuracy)}`).join(" ")}
            fill="none"
            className="stroke-primary"
            strokeWidth={2}
          />
        )}
        {bins.map((b, i) => (
          <g key={b.lower} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <circle cx={x(b.mean_predicted)} cy={y(b.observed_accuracy)} r={radius(b.count) + 6} fill="transparent" />
            <circle
              cx={x(b.mean_predicted)}
              cy={y(b.observed_accuracy)}
              r={radius(b.count)}
              className="fill-primary stroke-card"
              strokeWidth={2}
            />
          </g>
        ))}
      </svg>
      {active && (
        <div
          className="pointer-events-none absolute rounded-md border border-border bg-popover px-2 py-1 font-mono text-[10px] shadow-sm"
          style={{
            left: `${(x(active.mean_predicted) / W) * 100}%`,
            top: `${(y(active.observed_accuracy) / H) * 100}%`,
            transform: "translate(8px, -110%)",
          }}
        >
          <div>
            {pct(active.lower)}–{pct(active.upper)} · {active.count} labels
          </div>
          <div>
            stated {pct(active.mean_predicted)} · right {pct(active.observed_accuracy)}
          </div>
        </div>
      )}
    </div>
  );
}
