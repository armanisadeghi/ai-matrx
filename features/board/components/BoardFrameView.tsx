"use client";

/**
 * BoardFrameView — a titled region of the plane that groups related tiles (one
 * workflow run, one topic, one meeting). Frames are how a large board keeps
 * its sense of place: the label is counter-scaled at far zoom so the board
 * reads as a map of named regions.
 *
 * Gestures (Figma / tldraw / Miro):
 *   - the title strip and the border DRAG the frame, carrying every tile whose
 *     centre it holds (and frames inside it) — ONE undo step (`BoardMover`);
 *     shift / ⌘-click adds it to the selection; a click that never moves flies
 *     there and selects it;
 *   - a selected frame shows the eight resize handles; resizing moves no tile;
 *   - Delete / Backspace (the board's keys) or the selection toolbar's Delete removes
 *     the frame only — its tiles stay. "Delete with contents" is in its
 *     right-click menu (`BoardMenu`, `data-board-frame`).
 * The frame's body passes pointers through to the board, so a marquee that
 * starts inside a frame selects its tiles, never the frame.
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { Rect } from "../engine/camera";
import { useBoardCameraStore, useEditingTile, useIsSelected, useIsSoleSelected } from "../engine/react";
import { type ShapeColor, shapeColorCss } from "../engine/shapes";
import { FRAME_TITLE_BAND, boundsOf, frameKey, groupMoveSet, shiftMoves } from "../engine/selection";
import { beginSnap } from "../engine/snap-gesture";
import { startPointerGesture } from "../engine/pointer-gesture";
import { ResizeHandles } from "./BoardTile";

/**
 * A frame's label is a compact tag (FigJam): about 12 screen px at every zoom, so it counter-scales
 * with the board (world px = 12 / zoom, capped for far zoom). It was 26px+ and bold.
 */
const FRAME_LABEL_PX = "clamp(6px, calc(12px / var(--board-z, 1)), 160px)";
const FRAME_NOTE_PX = "clamp(5px, calc(10px / var(--board-z, 1)), 130px)";

/** Screen px of a frame's border that grabs it. */
const BORDER_GRAB_PX = 8;
/** Screen px a press must travel before it is a drag rather than a click. */
const DRAG_SLOP_PX = 3;

interface BoardFrameViewProps {
  id: string;
  rect: Rect;
  title: string;
  /** One-line note beside the title — what this region is for. */
  note?: string;
  /** The frame's colour; absent = neutral. */
  color?: ShapeColor;
  /** Resizes the frame (tiles stay where they are); absent = its size is the host's. */
  onResize?: (id: string, rect: Rect) => void;
  /** Renames the frame (double-click its title); absent = the title is the host's. */
  onRename?: (id: string, title: string) => void;
}

export function BoardFrameView({ id, rect, title, note, color, onResize, onRename }: BoardFrameViewProps) {
  const store = useBoardCameraStore();
  // The selection toolbar's Rename (and a double-click on the title) set the frame as the one being edited.
  const renaming = useEditingTile() === id;
  const setRenaming = (on: boolean) => store.setEditing(on ? id : null);
  const key = frameKey(id);
  const selected = useIsSelected(id);
  const sole = useIsSoleSelected(id);
  const rectRef = useRef(rect);
  useEffect(() => {
    rectRef.current = rect;
  });
  const gesture = useRef<(() => void) | null>(null);
  useEffect(() => () => gesture.current?.(), []);

  // The label sits ABOVE the rect, so the flown-to area includes its band —
  // flying to a frame shows its name, not just its contents. Registered once;
  // a move UPDATES (re-registering would drop the frame's selection mid-drag).
  useEffect(() => {
    const r = rectRef.current;
    return store.registerItem(key, { ...r, y: r.y - FRAME_TITLE_BAND, h: r.h + FRAME_TITLE_BAND });
  }, [store, key]);
  useEffect(
    () => store.updateItem(key, { ...rect, y: rect.y - FRAME_TITLE_BAND, h: rect.h + FRAME_TITLE_BAND }),
    [store, key, rect],
  );

  // A click no press led to (assistive tech, a script) selects from its own Shift / ⌘ flags.
  const pressedAt = useRef(0);
  const clicked = (e: React.MouseEvent<HTMLElement>) => {
    const pressed = pressedAt.current > 0 && Date.now() - pressedAt.current < 10_000;
    pressedAt.current = 0;
    if (pressed || e.button !== 0 || e.ctrlKey) return;
    if ((e.target as HTMLElement).closest("[data-board-frame-action]")) return;
    if (e.shiftKey || e.metaKey) store.toggleSelected(id);
    else store.select(id);
  };

  const press = (e: React.PointerEvent<HTMLElement>, flyOnClick: boolean) => {
    if (e.button === 0) pressedAt.current = Date.now();
    if (e.button !== 0 || e.ctrlKey) return; // ctrl+click is the macOS right-click (the menu)
    const target = e.target as HTMLElement;
    if (target.closest("[data-board-frame-action]")) return; // its own buttons
    e.preventDefault();
    e.stopPropagation();
    const additive = e.shiftKey || e.metaKey;
    const inGroup = store.isSelected(id) && store.getSelection().length > 1;
    if (additive) {
      store.toggleSelected(id);
      if (!store.isSelected(id)) return;
    } else if (!inGroup) store.select(id);
    const mover = store.getMover();
    const set = groupMoveSet(store.getSelection(), store.getItems());
    const box = boundsOf(set.values());
    const px = e.clientX;
    const py = e.clientY;
    let moved = false;
    const snap = mover && box ? beginSnap(store, new Set(set.keys())) : null;
    gesture.current?.();
    gesture.current = startPointerGesture(e.nativeEvent, e.currentTarget, {
      onMove: (m) => {
        if (!mover || !box || !snap) return;
        if (!moved && Math.hypot(m.clientX - px, m.clientY - py) < DRAG_SLOP_PX) return;
        moved = true;
        const z = store.getCamera().z;
        const at = snap.move({ ...box, x: box.x + (m.clientX - px) / z, y: box.y + (m.clientY - py) / z }, m);
        mover.dragMany(shiftMoves(set, at.x - box.x, at.y - box.y));
      },
      onEnd: (how) => {
        gesture.current = null;
        snap?.end();
        if (how === "escape" && moved && mover) mover.dragMany(shiftMoves(set, 0, 0));
        else if (how === "up" && !moved && !additive) {
          if (inGroup) store.select(id);
          if (flyOnClick) store.fitItem(key);
        }
      },
    });
  };

  const grab = `calc(${BORDER_GRAB_PX}px / var(--board-z, 1))`;
  const border: Record<"n" | "s" | "w" | "e", React.CSSProperties> = {
    n: { top: 0, left: 0, right: 0, height: grab },
    s: { bottom: 0, left: 0, right: 0, height: grab },
    w: { top: 0, bottom: 0, left: 0, width: grab },
    e: { top: 0, bottom: 0, right: 0, width: grab },
  };

  return (
    <div
      data-board-frame={id}
      data-board-title={title}
      className={cn(
        "pointer-events-none absolute max-w-none rounded-2xl border border-dashed bg-background/40",
        selected ? "border-primary" : color ? "" : "border-border/80",
      )}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        ...(color ? { background: shapeColorCss(color, 0.08), ...(selected ? null : { borderColor: shapeColorCss(color, 0.7) }) } : null),
      }}
    >
      {(["n", "s", "w", "e"] as const).map((edge) => (
        <div
          key={edge}
          data-board-frame-border={edge}
          aria-hidden
          onPointerDown={(e) => press(e, false)}
          onClick={clicked}
          className="pointer-events-auto absolute max-w-none cursor-grab touch-none active:cursor-grabbing"
          style={{ ...border[edge], zIndex: selected ? 1 : undefined }}
        />
      ))}
      <div
        data-board-frame-strip
        onPointerDown={(e) => press(e, true)}
        onClick={clicked}
        onDoubleClick={(e) => {
          if (!onRename || (e.target as HTMLElement).closest("[data-board-frame-action]")) return;
          e.stopPropagation();
          setRenaming(true);
        }}
        className="pointer-events-auto absolute bottom-full left-0 flex max-w-none cursor-grab touch-none items-center gap-2 pb-1 active:cursor-grabbing"
        // Titles read above everything a frame holds, the drawings layer (z 6) and a selected tile (z 7) included.
        style={{ zIndex: 8 }}
        title={`Drag to move ${title} with its tiles · click to fly there`}
      >
        {renaming && onRename ? (
          // ui-exception: a frame's name typed in place on the canvas (Figma); a raw short name
          <input
            data-board-frame-action
            aria-label="Frame name"
            autoFocus
            defaultValue={title}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => {
              const next = e.currentTarget.value.trim();
              setRenaming(false);
              if (next && next !== title) onRename(id, next);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") e.currentTarget.blur();
              else if (e.key === "Escape") {
                e.currentTarget.value = title;
                e.currentTarget.blur();
              }
            }}
            className="min-w-0 rounded-md border border-primary bg-background px-1 font-medium text-foreground outline-none"
            style={{ fontSize: FRAME_LABEL_PX, width: `${Math.max(title.length, 6) + 2}ch` }}
          />
        ) : (
          <span
            className={cn("whitespace-nowrap font-medium", selected ? "text-foreground" : "text-muted-foreground")}
            style={{ fontSize: FRAME_LABEL_PX }}
            title={onRename ? "Double-click to rename" : undefined}
          >
            {title}
          </span>
        )}
        {note && (
          <span
            className="truncate text-muted-foreground"
            style={{ fontSize: FRAME_NOTE_PX }}
          >
            {note}
          </span>
        )}
      </div>
      {onResize && sole && (
        <div className="pointer-events-auto">
          <ResizeHandles id={id} rect={rect} selected onResize={onResize} />
        </div>
      )}
    </div>
  );
}
