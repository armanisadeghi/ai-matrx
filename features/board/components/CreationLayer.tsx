"use client";

/**
 * CreationLayer — while a creation tool is active, the board's left press
 * belongs to it. Click places (note, text); drag draws (frame, rectangle,
 * oval, arrow, line); the pen records a stroke. The layer shows a live
 * preview in screen space, converts the result to WORLD coordinates and hands
 * it to the host, then returns to Select (Figma) — except the pen and the
 * eraser, which stay until you choose another tool (FigJam). The eraser fades
 * every drawing its path touches and removes them on release (one undo step).
 */

import { useEffect, useRef, useState } from "react";
import { screenToWorld } from "../engine/camera";
import { useActiveTool, useBoardCameraStore } from "../engine/react";
import { isCreationTool, type BoardTool } from "../engine/tools";
import { startPointerGesture } from "../engine/pointer-gesture";

export type Creation =
  | { tool: "note" | "text"; at: { x: number; y: number } }
  | { tool: "frame" | "rect" | "oval"; rect: { x: number; y: number; w: number; h: number } }
  | { tool: "arrow" | "line"; from: { x: number; y: number }; to: { x: number; y: number } }
  | { tool: "pen"; points: { x: number; y: number }[] }
  /** The eraser swept over these drawings: remove them as one step. */
  | { tool: "eraser"; ids: string[] };

/** Screen px the eraser reaches around its path. */
const ERASER_REACH_PX = 8;

/** Below this many screen px a drag is a click: the item gets its default size. */
const CLICK_SLOP = 6;
const DEFAULT_SIZE: Partial<Record<BoardTool, { w: number; h: number }>> = {
  frame: { w: 960, h: 640 },
  rect: { w: 240, h: 160 },
  oval: { w: 200, h: 200 },
};

export function CreationLayer({ onCreate }: { onCreate: (c: Creation) => void }) {
  const store = useBoardCameraStore();
  const tool = useActiveTool();
  const [drag, setDrag] = useState<{ points: { x: number; y: number }[] } | null>(null);
  // The drawing in flight; it ends on every way a press can end
  // (`startPointerGesture`), so a missed release never leaves a shape half-drawn.
  const gesture = useRef<(() => void) | null>(null);
  useEffect(() => () => gesture.current?.(), []);

  if (!isCreationTool(tool)) return null;

  const localTo = (el: Element, e: { clientX: number; clientY: number }) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const world = (p: { x: number; y: number }) => screenToWorld(store.getCamera(), p.x, p.y);

  // The eraser: every drawing within reach of the path (sampled every few screen px, so a fast
  // swipe misses nothing) fades now and goes on release; Escape or a lost press keeps them all.
  const erase = (down: PointerEvent, layer: HTMLElement) => {
    const hit = new Set<string>();
    const mark = (id: string, on: boolean) => {
      const el = document.querySelector(`[data-board-shape="${CSS.escape(id)}"]`);
      if (on) el?.setAttribute("data-erasing", "");
      else el?.removeAttribute("data-erasing");
    };
    const sweep = (p: { x: number; y: number }) => {
      const host = store.getShapeHost();
      if (!host) return;
      const tolerance = ERASER_REACH_PX / store.getCamera().z;
      for (let i = 0; i < 20; i++) {
        const id = host.hit(world(p), tolerance, { background: false, except: hit });
        if (!id) return;
        hit.add(id);
        mark(id, true);
      }
    };
    let last = localTo(layer, down);
    sweep(last);
    return startPointerGesture(down, layer, {
      onMove: (m) => {
        const p = localTo(layer, m);
        const steps = Math.max(1, Math.ceil(Math.hypot(p.x - last.x, p.y - last.y) / 4));
        for (let i = 1; i <= steps; i++) sweep({ x: last.x + ((p.x - last.x) * i) / steps, y: last.y + ((p.y - last.y) * i) / steps });
        last = p;
      },
      onEnd: (how) => {
        gesture.current = null;
        for (const id of hit) mark(id, false);
        if (how === "up" && hit.size > 0) onCreate({ tool: "eraser", ids: [...hit] });
      },
    });
  };

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
      data-board-creation
      className="absolute inset-0 z-20"
      style={{ cursor: tool === "text" ? "text" : tool === "eraser" ? "cell" : "crosshair" }}
      onPointerDown={(e) => {
        if (e.button !== 0 || e.ctrlKey) return; // ctrl+click is the macOS right-click
        const layer = e.currentTarget;
        if (tool === "eraser") {
          gesture.current?.();
          gesture.current = erase(e.nativeEvent, layer);
          return;
        }
        let points = [localTo(layer, e)];
        setDrag({ points });
        gesture.current?.();
        gesture.current = startPointerGesture(e.nativeEvent, layer, {
          onMove: (m) => {
            const p = localTo(layer, m);
            points = tool === "pen" ? [...points, p] : [points[0], p];
            setDrag({ points });
          },
          onEnd: (how, end) => {
            gesture.current = null;
            setDrag(null);
            // Only a real release makes the shape; Escape, a lost press or a
            // tool switch mid-draw drops it.
            if (how !== "up") return;
            if (end) points = tool === "pen" ? [...points, localTo(layer, end)] : [points[0], localTo(layer, end)];
            finish(points);
          },
        });
      }}
    >
      {drag && <Preview tool={tool} points={drag.points} />}
    </div>
  );
}

function Preview({ tool, points }: { tool: BoardTool; points: { x: number; y: number }[] }) {
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
