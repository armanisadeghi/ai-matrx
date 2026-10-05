"use client";

/**
 * SnapGuidesLayer — the thin lines drawn while a tile is dragged or resized
 * (Figma smart guides): one line through every aligned edge / centre, and a
 * bracketed segment over each gap that matches a neighbouring gap. Lives in
 * world space as ONE leaf that subscribes to the overlay, so a drag re-renders
 * this and nothing else; strokes are `non-scaling` so they stay 1 screen px at
 * any zoom.
 */

import { useBoardCameraStore, useSnapOverlay } from "../engine/react";

const TICK_PX = 4;

export function SnapGuidesLayer() {
  const overlay = useSnapOverlay();
  const store = useBoardCameraStore();
  if (!overlay) return null;
  const tick = TICK_PX / store.getCamera().z;
  return (
    <svg
      aria-hidden
      data-board-snap-guides
      width={1}
      height={1}
      className="pointer-events-none absolute left-0 top-0 max-w-none overflow-visible text-primary"
      style={{ zIndex: 2147483000 }}
    >
      {overlay.lines.map((l) => (
        <line
          key={`${l.axis}${l.at}`}
          x1={l.axis === "x" ? l.at : l.from}
          x2={l.axis === "x" ? l.at : l.to}
          y1={l.axis === "x" ? l.from : l.at}
          y2={l.axis === "x" ? l.to : l.at}
          stroke="currentColor"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {overlay.gaps.map((g, i) => {
        const h = g.axis === "x";
        return (
          <g key={`gap${i}`} stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke">
            <line x1={h ? g.from : g.at} x2={h ? g.to : g.at} y1={h ? g.at : g.from} y2={h ? g.at : g.to} vectorEffect="non-scaling-stroke" />
            {[g.from, g.to].map((p) => (
              <line
                key={p}
                x1={h ? p : g.at - tick}
                x2={h ? p : g.at + tick}
                y1={h ? g.at - tick : p}
                y2={h ? g.at + tick : p}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
