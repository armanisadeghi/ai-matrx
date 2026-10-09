"use client";

/**
 * Arrange — the people's door to the arrange engine (`engine/arrange.ts`, the
 * same math `board_arrange` uses). One command = ONE undo step (`moveMany`,
 * frames drawn in the same step), and the move is animated: every moved tile
 * and frame glides from where it was on the panel motion pair (FLIP on
 * `transform`, compositor-only, so a 100-tile board arranges smoothly).
 */

import { flushSync } from "react-dom";
import type { Rect } from "../engine/camera";
import { type ArrangeCommand, planArrange } from "../engine/arrange";
import { boundsOfPoints, isConnector, type ShapeKind } from "../engine/shapes";
import type { BoardFrame } from "./board-store";
import type { BoardStore } from "./useBoard";

/** Each command's label and keyboard shortcut — the menu and the keys read this one table. */
export const ARRANGE_SHORTCUT = {
  tidy: "⌃⌥T",
  byType: "⌃⌥G",
  alignLeft: "⌥A",
  alignCenter: "⌥H",
  alignRight: "⌥D",
  alignTop: "⌥W",
  alignMiddle: "⌥V",
  alignBottom: "⌥S",
  distributeH: "⌃⌥H",
  distributeV: "⌃⌥V",
} as const;

/** The command a key press asks for, if any (`code`, so ⌥ on a Mac — which types "å" — still matches). */
export function arrangeCommandForKey(e: {
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): ArrangeCommand | null {
  if (!e.altKey || e.metaKey || e.shiftKey) return null;
  if (e.ctrlKey) {
    if (e.code === "KeyT") return { kind: "layout", layout: "tidy" };
    if (e.code === "KeyG") return { kind: "by-type" };
    if (e.code === "KeyH") return { kind: "distribute", axis: "horizontal" };
    if (e.code === "KeyV") return { kind: "distribute", axis: "vertical" };
    return null;
  }
  const edge = (
    { KeyA: "left", KeyH: "center", KeyD: "right", KeyW: "top", KeyV: "middle", KeyS: "bottom" } as const
  )[e.code as "KeyA"];
  return edge ? { kind: "align", edge } : null;
}

/**
 * Stickies, text, shapes and strokes are arranged with the tiles (FigJam: Arrange acts on every object).
 * Their group is the kind of canvas object; connectors (line / arrow) are not objects, they follow
 * what they are bound to.
 */
export const SHAPE_ARRANGE_GROUPS = ["sticky", "text", "shape", "drawing"] as const;
export const SHAPE_GROUP_LABEL: Record<(typeof SHAPE_ARRANGE_GROUPS)[number], string> = {
  sticky: "Sticky notes",
  text: "Text",
  shape: "Shapes",
  drawing: "Drawings",
};
export function shapeArrangeGroup(kind: ShapeKind): (typeof SHAPE_ARRANGE_GROUPS)[number] {
  if (kind === "sticky" || kind === "text") return kind;
  return kind === "pen" ? "drawing" : "shape";
}

interface ArrangeTile {
  id: string;
  rect: Rect;
}

/**
 * Run one Arrange command on a board. `groupOf` names each tile's item type
 * (the by-type order is `order`, the Add menu's); `frameTitle` names a type
 * frame. Returns how many things moved (0 = already arranged, nothing done).
 */
export function runArrange<T extends ArrangeTile>(
  board: BoardStore<T>,
  command: ArrangeCommand,
  opts: {
    groupOf: (tile: T) => string;
    order: readonly string[];
    frameTitle: (group: string) => string;
    /** Where the board's tiles are in the DOM (the animation finds them there). */
    root?: ParentNode | null;
    /** Arrange only these (2+ selected): selected frames carry their tiles. Absent = the whole board. */
    only?: readonly string[];
  },
): number {
  const now = board.read();
  const scene = {
    tiles: [
      ...now.tiles.map((t) => ({ id: t.id, rect: t.rect, group: opts.groupOf(t) })),
      ...board
        .getShapes()
        .filter((sh) => !isConnector(sh.kind))
        .map((sh) => ({ id: sh.id, rect: boundsOfPoints(sh.points), group: shapeArrangeGroup(sh.kind) as string })),
    ],
    frames: now.frames.map((f) => ({ id: f.id, rect: f.rect })),
  };
  const plan = planArrange(scene, command, opts.order, opts.only);
  if (plan.moves.length === 0 && plan.frames.length === 0) return 0;
  const before = new Map<string, Rect>([...scene.tiles, ...scene.frames].map((p) => [p.id, p.rect]));
  const addFrames: BoardFrame[] = plan.frames.map((f) => ({
    id: `frame:${crypto.randomUUID().slice(0, 8)}`,
    rect: f.rect,
    title: opts.frameTitle(f.group),
  }));
  // Commit synchronously so the elements are already at their new place when
  // the animation starts from the old one (FLIP).
  flushSync(() => board.moveMany(plan.moves, { addFrames }));
  glide(plan.moves, before, opts.root ?? (typeof document !== "undefined" ? document : null));
  return plan.moves.length + addFrames.length;
}

function glide(moves: { id: string; x: number; y: number }[], before: Map<string, Rect>, root: ParentNode | null) {
  if (!root || typeof window === "undefined") return;
  const css = getComputedStyle(document.documentElement);
  const duration = parseFloat(css.getPropertyValue("--matrx-motion-duration-panel")) || 0;
  const easing = css.getPropertyValue("--matrx-motion-ease-panel").trim() || "ease-in-out";
  if (duration <= 0) return; // reduced motion: the token is 0ms
  for (const m of moves) {
    const was = before.get(m.id);
    if (!was) continue;
    const el = root.querySelector<HTMLElement>(
      `[data-board-tile="${CSS.escape(m.id)}"], [data-board-frame="${CSS.escape(m.id)}"]`,
    );
    if (!el || typeof el.animate !== "function") continue;
    // Positions are world px inside the scaled world layer, so the offset is too.
    el.animate(
      [{ transform: `translate(${was.x - m.x}px, ${was.y - m.y}px)` }, { transform: "translate(0, 0)" }],
      { duration, easing },
    );
  }
}
