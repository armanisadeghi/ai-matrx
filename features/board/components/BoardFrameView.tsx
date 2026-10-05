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
 *   - Delete / Backspace (the board's keys) or the label's trash button removes
 *     the frame only — its tiles stay. "Delete with contents" is in its
 *     right-click menu (`BoardMenu`, `data-board-frame`).
 * The frame's body passes pointers through to the board, so a marquee that
 * starts inside a frame selects its tiles, never the frame.
 */

import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Rect } from "../engine/camera";
import { useBoardCameraStore, useIsSelected, useIsSoleSelected } from "../engine/react";
import { FRAME_TITLE_BAND, boundsOf, frameKey, groupMoveSet, shiftMoves } from "../engine/selection";
import { beginSnap } from "../engine/snap-gesture";
import { startPointerGesture } from "../engine/pointer-gesture";
import { ResizeHandles } from "./BoardTile";

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
  /** Removes the frame (never its tiles); absent = the host keeps its frames. */
  onRemove?: (id: string) => void;
  /** Resizes the frame (tiles stay where they are); absent = its size is the host's. */
  onResize?: (id: string, rect: Rect) => void;
}

export function BoardFrameView({ id, rect, title, note, onRemove, onResize }: BoardFrameViewProps) {
  const store = useBoardCameraStore();
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

  const press = (e: React.PointerEvent<HTMLElement>, flyOnClick: boolean) => {
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
        selected ? "border-primary" : "border-border/80",
      )}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: selected ? 1 : undefined }}
    >
      {(["n", "s", "w", "e"] as const).map((edge) => (
        <div
          key={edge}
          data-board-frame-border={edge}
          aria-hidden
          onPointerDown={(e) => press(e, false)}
          className="pointer-events-auto absolute max-w-none cursor-grab touch-none active:cursor-grabbing"
          style={border[edge]}
        />
      ))}
      <div
        data-board-frame-strip
        onPointerDown={(e) => press(e, true)}
        className="pointer-events-auto absolute bottom-full left-0 flex max-w-none cursor-grab touch-none items-center gap-2 pb-3 active:cursor-grabbing"
        title={`Drag to move ${title} with its tiles · click to fly there`}
      >
        <span
          className="whitespace-nowrap font-semibold tracking-tight text-foreground"
          style={{ fontSize: "max(26px, min(calc(13px / var(--board-z)), 160px))" }}
        >
          {title}
        </span>
        {note && (
          <span
            className="truncate text-muted-foreground"
            style={{ fontSize: "max(15px, min(calc(9px / var(--board-z)), 90px))" }}
          >
            {note}
          </span>
        )}
        {onRemove && sole && (
          <button
            type="button"
            data-board-frame-action
            onClick={() => onRemove(id)}
            aria-label={`Delete frame ${title}`}
            title="Delete frame (its tiles stay)"
            className="flex items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-destructive"
            style={{
              width: "max(32px, calc(14px / var(--board-z)))",
              height: "max(32px, calc(14px / var(--board-z)))",
            }}
          >
            <Trash2 style={{ width: "50%", height: "50%" }} />
          </button>
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
