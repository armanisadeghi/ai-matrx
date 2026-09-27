"use client";

/**
 * ShapesLayer — the marks people draw on the board (rectangles, ovals, arrows,
 * lines, pen strokes), in WORLD space so they pan and zoom with everything
 * else. Strokes keep a constant on-screen weight via `vector-effect`. A shape
 * is selectable (click) so Delete and the menu can act on it.
 */

import { cn } from "@/lib/utils";
import type { BoardShape } from "../board/useBoard";
import { useSelectedTile, useSpatialStore } from "../engine/react";

export function ShapesLayer({ shapes }: { shapes: BoardShape[] }) {
  const store = useSpatialStore();
  const selected = useSelectedTile();
  if (shapes.length === 0) return null;
  return (
    <svg className="pointer-events-none absolute left-0 top-0 h-px w-px max-w-none overflow-visible text-foreground/80">
      <defs>
        <marker id="spatial-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
        </marker>
      </defs>
      {shapes.map((s) => {
        const on = selected === s.id;
        const common = {
          className: cn("pointer-events-auto cursor-pointer", on && "text-primary"),
          stroke: "currentColor",
          strokeWidth: on ? 3 : 2,
          vectorEffect: "non-scaling-stroke" as const,
          fill: "none",
          onPointerDown: (e: React.PointerEvent) => {
            e.stopPropagation();
            store.select(s.id);
          },
          "data-spatial-shape": s.id,
        };
        const [a, b] = s.points;
        switch (s.kind) {
          case "rect":
            return <rect key={s.id} {...common} x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} rx={6} />;
          case "oval":
            return <ellipse key={s.id} {...common} cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} rx={Math.abs(b.x - a.x) / 2} ry={Math.abs(b.y - a.y) / 2} />;
          case "line":
            return <line key={s.id} {...common} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          case "arrow":
            return <line key={s.id} {...common} x1={a.x} y1={a.y} x2={b.x} y2={b.y} markerEnd="url(#spatial-arrowhead)" />;
          case "pen":
            return (
              <polyline
                key={s.id}
                {...common}
                points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
        }
      })}
    </svg>
  );
}
