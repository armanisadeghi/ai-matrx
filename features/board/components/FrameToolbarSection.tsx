"use client";

/**
 * The selection toolbar's section for frames (FigJam): Rename, Colour, Fit to contents, Arrange
 * inside. Delete and layer order come from the shared actions section — a frame has ONE delete.
 */

import { useSyncExternalStore } from "react";
import { LayoutGrid, Maximize, Pencil } from "lucide-react";
import type { BoardStore, BoardTileBase } from "../board/board-store";
import type { Rect } from "../engine/camera";
import { boundsOfPoints, isConnector, shapeColorCss } from "../engine/shapes";
import { useBoardCameraStore } from "../engine/react";
import {
  ColorSwatches,
  type SelectionToolbarSection,
  SelectionToolbarButton,
  SelectionToolbarMenu,
} from "./SelectionToolbar";

/** Room a fitted frame keeps around what it holds. */
export const FRAME_FIT_PADDING = 48;

/** Ids of the tiles and canvas objects whose centre a frame holds (what it carries and arranges). */
export function idsInFrame<T extends BoardTileBase>(board: BoardStore<T>, frame: Rect): string[] {
  const inside = (r: Rect) => {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    return cx >= frame.x && cx <= frame.x + frame.w && cy >= frame.y && cy <= frame.y + frame.h;
  };
  return [
    ...board.read().tiles.filter((t) => inside(t.rect)).map((t) => t.id),
    ...board.getShapes().filter((s) => !isConnector(s.kind) && inside(boundsOfPoints(s.points))).map((s) => s.id),
  ];
}

/** The frame rect that fits what it holds (padding around), or null when it holds nothing. */
export function fitFrameRect<T extends BoardTileBase>(board: BoardStore<T>, frame: Rect): Rect | null {
  const rects: Rect[] = [];
  const held = new Set(idsInFrame(board, frame));
  for (const t of board.read().tiles) if (held.has(t.id)) rects.push(t.rect);
  for (const s of board.getShapes()) if (held.has(s.id)) rects.push(boundsOfPoints(s.points));
  if (rects.length === 0) return null;
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0 - FRAME_FIT_PADDING, y: y0 - FRAME_FIT_PADDING, w: x1 - x0 + FRAME_FIT_PADDING * 2, h: y1 - y0 + FRAME_FIT_PADDING * 2 };
}

export function frameToolbarSection<T extends BoardTileBase>({
  board,
  arrangeInside,
}: {
  board: BoardStore<T>;
  /** Tidy what the frame holds (ids), as one undo step. */
  arrangeInside: (ids: string[]) => void;
}): SelectionToolbarSection {
  const isFrame = (id: string) => board.read().frames.some((f) => f.id === id);
  return {
    key: "frame",
    scope: "type",
    label: "Frames",
    applies: (ids) => ids.some(isFrame),
    render: (ids) => <FrameControls board={board} ids={ids.filter(isFrame)} arrangeInside={arrangeInside} />,
  };
}

function FrameControls<T extends BoardTileBase>({
  board,
  ids,
  arrangeInside,
}: {
  board: BoardStore<T>;
  ids: string[];
  arrangeInside: (ids: string[]) => void;
}) {
  const store = useBoardCameraStore();
  // Re-read when frames change (a colour pick), not per camera frame.
  const frames = useSyncExternalStore(board.subscribe, () => board.read().frames, () => board.read().frames).filter((f) => ids.includes(f.id));
  if (frames.length === 0) return null;
  const sole = frames.length === 1 ? frames[0] : null;
  const color = frames.every((f) => f.color === frames[0].color) ? (frames[0].color ?? null) : null;
  return (
    <>
      {sole && <SelectionToolbarButton label="Rename" icon={Pencil} onClick={() => store.setEditing(sole.id)} />}
      <SelectionToolbarMenu
        label="Frame color"
        trigger={
          <span
            aria-hidden
            className="h-4 w-4 rounded-[4px] border border-border"
            style={{ background: color ? shapeColorCss(color, 0.35) : "transparent" }}
          />
        }
      >
        <ColorSwatches
          value={color ?? "none"}
          withNone
          alpha={0.35}
          onPick={(c) => frames.forEach((f) => board.updateFrame(f.id, { color: c === "none" ? undefined : c }))}
        />
      </SelectionToolbarMenu>
      <SelectionToolbarButton
        label="Fit to contents"
        icon={Maximize}
        onClick={() =>
          frames.forEach((f) => {
            const fit = fitFrameRect(board, f.rect);
            if (fit) board.resizeTile(f.id, fit);
          })
        }
      />
      {sole && <SelectionToolbarButton label="Arrange inside" icon={LayoutGrid} onClick={() => arrangeInside(idsInFrame(board, sole.rect))} />}
    </>
  );
}
