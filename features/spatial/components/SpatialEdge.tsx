"use client";

/**
 * SpatialEdge — a connector between two tiles in world space (a pipeline
 * stage handing off to the next). Right edge of `from` → left edge of `to`
 * as a soft horizontal S-curve, or top-to-bottom when stacked.
 */

import type { Rect } from "../engine/camera";

export function SpatialEdge({ from, to }: { from: Rect; to: Rect }) {
  const stacked = to.x < from.x + from.w && to.x + to.w > from.x;
  const a = stacked
    ? { x: from.x + from.w / 2, y: from.y + from.h }
    : { x: from.x + from.w, y: from.y + from.h / 2 };
  const b = stacked ? { x: to.x + to.w / 2, y: to.y } : { x: to.x, y: to.y + to.h / 2 };
  const pad = 40;
  const minX = Math.min(a.x, b.x) - pad;
  const minY = Math.min(a.y, b.y) - pad;
  const w = Math.abs(b.x - a.x) + pad * 2;
  const h = Math.abs(b.y - a.y) + pad * 2;
  const ax = a.x - minX;
  const ay = a.y - minY;
  const bx = b.x - minX;
  const by = b.y - minY;
  const d = stacked
    ? `M ${ax} ${ay} C ${ax} ${(ay + by) / 2}, ${bx} ${(ay + by) / 2}, ${bx} ${by}`
    : `M ${ax} ${ay} C ${(ax + bx) / 2} ${ay}, ${(ax + bx) / 2} ${by}, ${bx} ${by}`;

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute max-w-none overflow-visible text-muted-foreground/60"
      style={{ left: minX, top: minY, width: w, height: h }}
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2.5} strokeDasharray="8 8" />
      <circle cx={bx} cy={by} r={5} fill="currentColor" />
    </svg>
  );
}
