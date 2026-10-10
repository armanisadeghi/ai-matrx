"use client";

/**
 * Connection handles: a small dot just outside each side of a hovered or selected tile. Drag one onto
 * another tile to connect them — the same bound arrow the Arrow tool draws (`onConnect` is the host's
 * arrow creation), without leaving the Select tool. They sit beyond the resize handles' outer edge, so
 * dragging the frame itself still resizes.
 */

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";

import { useBoardCameraStore } from "../engine/react";
import { startPointerGesture } from "../engine/pointer-gesture";
import { RESIZE_HANDLE_SCREEN_PX } from "../engine/tile-gestures";
import type { Rect } from "../engine/camera";

type Side = "n" | "e" | "s" | "w";
const SIDES: readonly Side[] = ["n", "e", "s", "w"];
/** Screen px from the tile edge to the dot's centre: clear of the resize handle's outer reach. */
const REACH_PX = RESIZE_HANDLE_SCREEN_PX * 0.7 + 11;
const DOT_PX = 16;

export type ConnectPoint = { x: number; y: number };

/** The world point just inside a tile's side: where an arrow starts so the host reads it as "from this tile". */
export function sideStart(rect: Rect, side: Side, inset = 6): ConnectPoint {
  switch (side) {
    case "n":
      return { x: rect.x + rect.w / 2, y: rect.y + inset };
    case "s":
      return { x: rect.x + rect.w / 2, y: rect.y + rect.h - inset };
    case "w":
      return { x: rect.x + inset, y: rect.y + rect.h / 2 };
    case "e":
      return { x: rect.x + rect.w - inset, y: rect.y + rect.h / 2 };
  }
}

export function ConnectHandles({
  id,
  rect,
  onConnect,
}: {
  id: string;
  rect: Rect;
  onConnect: (id: string, from: ConnectPoint, to: ConnectPoint) => void;
}) {
  const store = useBoardCameraStore();
  const gesture = useRef<(() => void) | null>(null);
  const [drag, setDrag] = useState<{ side: Side; dx: number; dy: number } | null>(null);
  useEffect(() => () => gesture.current?.(), []);

  const begin = (side: Side) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
    gesture.current?.();
    const px = e.clientX;
    const py = e.clientY;
    const from = sideStart(rect, side);
    let last = { dx: 0, dy: 0 };
    setDrag({ side, dx: 0, dy: 0 });
    gesture.current = startPointerGesture(e.nativeEvent, e.currentTarget, {
      onMove: (m) => {
        const z = store.getCamera().z;
        last = { dx: (m.clientX - px) / z, dy: (m.clientY - py) / z };
        setDrag({ side, ...last });
      },
      onEnd: (how) => {
        gesture.current = null;
        setDrag(null);
        if (how === "up" && Math.hypot(last.dx, last.dy) > 8) {
          // The start sits on the tile's side; the end is where the pointer was released.
          const origin = { x: from.x + (REACH_PX / store.getCamera().z) * (side === "e" ? 1 : side === "w" ? -1 : 0), y: from.y + (REACH_PX / store.getCamera().z) * (side === "s" ? 1 : side === "n" ? -1 : 0) };
          onConnect(id, from, { x: origin.x + last.dx, y: origin.y + last.dy });
        }
      },
    });
  };

  const reach = `calc(${-REACH_PX}px / var(--board-z, 1))`;
  const size = `calc(${DOT_PX}px / var(--board-z, 1))`;
  const place: Record<Side, React.CSSProperties> = {
    n: { top: reach, left: "50%", transform: "translateX(-50%)" },
    s: { bottom: reach, left: "50%", transform: "translateX(-50%)" },
    w: { left: reach, top: "50%", transform: "translateY(-50%)" },
    e: { right: reach, top: "50%", transform: "translateY(-50%)" },
  };
  const z = store.getCamera().z;
  return (
    <>
      {SIDES.map((side) => (
        <div
          key={side}
          data-board-connect={side}
          role="presentation"
          title="Drag to connect"
          onPointerDown={begin(side)}
          className={
            "absolute z-10 flex max-w-none touch-none cursor-crosshair items-center justify-center rounded-full border border-primary bg-card text-primary shadow-sm transition-opacity " +
            (drag ? "opacity-100" : "opacity-0 group-hover/tile:opacity-100")
          }
          style={{ ...place[side], width: size, height: size }}
        >
          <ArrowUpRight className="h-[65%] w-[65%]" aria-hidden />
        </div>
      ))}
      {drag ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 z-20 overflow-visible"
          width={rect.w}
          height={rect.h}
          style={{ maxWidth: "none" }}
        >
          <line
            x1={sideStart({ x: 0, y: 0, w: rect.w, h: rect.h }, drag.side).x}
            y1={sideStart({ x: 0, y: 0, w: rect.w, h: rect.h }, drag.side).y}
            x2={sideStart({ x: 0, y: 0, w: rect.w, h: rect.h }, drag.side).x + (REACH_PX / z) * (drag.side === "e" ? 1 : drag.side === "w" ? -1 : 0) + drag.dx}
            y2={sideStart({ x: 0, y: 0, w: rect.w, h: rect.h }, drag.side).y + (REACH_PX / z) * (drag.side === "s" ? 1 : drag.side === "n" ? -1 : 0) + drag.dy}
            stroke="hsl(var(--primary))"
            strokeWidth={2 / z}
            strokeDasharray={`${6 / z} ${4 / z}`}
          />
        </svg>
      ) : null}
    </>
  );
}
