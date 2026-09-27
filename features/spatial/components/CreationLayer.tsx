"use client";

/**
 * CreationLayer — while a creation tool is active, the board's left press
 * belongs to it. Click places (note, text); drag draws (frame, rectangle,
 * oval, arrow, line); the pen records a stroke. The layer shows a live
 * preview in screen space, converts the result to WORLD coordinates and hands
 * it to the host, then returns to Select (Figma) — except the pen, which stays
 * until you choose another tool (FigJam).
 */

import { useState } from "react";
import { screenToWorld } from "../engine/camera";
import { useActiveTool, useSpatialStore } from "../engine/react";
import { isCreationTool, type SpatialTool } from "../engine/tools";

export type Creation =
  | { tool: "note" | "text"; at: { x: number; y: number } }
  | { tool: "frame" | "rect" | "oval"; rect: { x: number; y: number; w: number; h: number } }
  | { tool: "arrow" | "line"; from: { x: number; y: number }; to: { x: number; y: number } }
  | { tool: "pen"; points: { x: number; y: number }[] };

/** Below this many screen px a drag is a click: the item gets its default size. */
const CLICK_SLOP = 6;
const DEFAULT_SIZE: Partial<Record<SpatialTool, { w: number; h: number }>> = {
  frame: { w: 960, h: 640 },
  rect: { w: 240, h: 160 },
  oval: { w: 200, h: 200 },
};

export function CreationLayer({ onCreate }: { onCreate: (c: Creation) => void }) {
  const store = useSpatialStore();
  const tool = useActiveTool();
  const [drag, setDrag] = useState<{ points: { x: number; y: number }[] } | null>(null);

  if (!isCreationTool(tool)) return null;

  const local = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const world = (p: { x: number; y: number }) => screenToWorld(store.getCamera(), p.x, p.y);

  const finish = (points: { x: number; y: number }[]) => {
    const a = points[0];
    const b = points[points.length - 1];
    const moved = Math.hypot(b.x - a.x, b.y - a.y) > CLICK_SLOP;
    const wa = world(a);
    const wb = world(b);
    switch (tool) {
      case "note":
      case "text":
        onCreate({ tool, at: wa });
        break;
      case "frame":
      case "rect":
      case "oval": {
        const size = DEFAULT_SIZE[tool] ?? { w: 200, h: 200 };
        const rect = moved
          ? { x: Math.min(wa.x, wb.x), y: Math.min(wa.y, wb.y), w: Math.abs(wb.x - wa.x), h: Math.abs(wb.y - wa.y) }
          : { x: wa.x - size.w / 2, y: wa.y - size.h / 2, w: size.w, h: size.h };
        onCreate({ tool, rect });
        break;
      }
      case "arrow":
      case "line":
        if (moved) onCreate({ tool, from: wa, to: wb });
        break;
      case "pen":
        if (points.length > 1) onCreate({ tool, points: points.map(world) });
        break;
    }
    if (tool !== "pen") store.setTool("select");
  };

  return (
    <div
      data-spatial-creation
      className="absolute inset-0 z-20"
      style={{ cursor: tool === "text" ? "text" : "crosshair" }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ points: [local(e)] });
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        const p = local(e);
        setDrag((d) => (d ? { points: tool === "pen" ? [...d.points, p] : [d.points[0], p] } : d));
      }}
      onPointerUp={(e) => {
        if (!drag) return;
        const points = tool === "pen" ? [...drag.points, local(e)] : [drag.points[0], local(e)];
        setDrag(null);
        finish(points);
      }}
    >
      {drag && <Preview tool={tool} points={drag.points} />}
    </div>
  );
}

function Preview({ tool, points }: { tool: SpatialTool; points: { x: number; y: number }[] }) {
  const a = points[0];
  const b = points[points.length - 1];
  const box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-primary">
      {(tool === "frame" || tool === "rect") && (
        <rect
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
          rx={tool === "frame" ? 12 : 4}
          fill="currentColor"
          fillOpacity={0.06}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray={tool === "frame" ? "6 4" : undefined}
        />
      )}
      {tool === "oval" && (
        <ellipse
          cx={box.x + box.w / 2}
          cy={box.y + box.h / 2}
          rx={box.w / 2}
          ry={box.h / 2}
          fill="currentColor"
          fillOpacity={0.06}
          stroke="currentColor"
          strokeWidth={1.5}
        />
      )}
      {(tool === "line" || tool === "arrow") && (
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="currentColor" strokeWidth={2} />
      )}
      {tool === "pen" && (
        <polyline
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
