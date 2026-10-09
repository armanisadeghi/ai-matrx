"use client";

/**
 * Words ON the canvas — sticky notes and plain text — drawn in the shapes
 * layer (`ShapesLayer`), so they share the drawings' selection, move, resize,
 * delete, undo, snap and marquee.
 *
 *  - A sticky (FigJam / Miro): a coloured square card, no header. Its words
 *    shrink to fit the card. Click it once to select, again (or double-click,
 *    or Enter) to type; Esc leaves; Tab makes the next sticky beside it.
 *  - Plain text (tldraw / Figma): words with no box. It grows with what you
 *    type and wraps once you give it a width (drag a side handle).
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BoardStore, BoardTileBase } from "../board/board-store";
import type { Rect } from "../engine/camera";
import { useBoardCameraStore } from "../engine/react";
import { type BoardShape, type ShapeStyle, type StickyColor, TEXT_SIZES, boundsOfPoints, shapeColorCss, styleOf } from "../engine/shapes";
import { nextStickyBeside } from "../engine/canvas-text";

type AnyBoard = BoardStore<BoardTileBase>;

/** A sticky's card colour (light + dark from `board-accents.css`). */
export const stickyColorCss = (c: StickyColor): string => `hsl(var(--board-sticky-${c}))`;
const STICKY_INK = "hsl(var(--board-sticky-ink))";

const alignOf = (a: ShapeStyle["textAlign"]) => (a === "start" ? "left" : a === "end" ? "right" : "center");

/** The words' padding inside a sticky, in world px (scales with the card). */
const stickyPad = (box: Rect) => Math.max(8, Math.min(box.w, box.h) * 0.08);
/** The largest font a sticky starts from; the words shrink from here until they fit (FigJam). */
const stickyMaxFont = (box: Rect) => Math.max(10, Math.min(box.w, box.h) / 9);
const STICKY_MIN_FONT = 6;

/**
 * The largest font size (from `max` down to `min`) at which `el` fits within
 * `limit` px of height — a binary search over whole pixels.
 */
function fitFont(el: HTMLElement, limit: number, max: number, min: number): number {
  let lo = min;
  let hi = Math.floor(max);
  el.style.fontSize = `${hi}px`;
  if (el.scrollHeight <= limit + 1) return hi;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    el.style.fontSize = `${mid}px`;
    if (el.scrollHeight <= limit + 1) lo = mid;
    else hi = mid - 1;
  }
  el.style.fontSize = `${lo}px`;
  return lo;
}

// ── sticky ───────────────────────────────────────────────────────────────────

export function StickyCard({ shape, box, editing }: { shape: BoardShape; box: Rect; editing: boolean }) {
  const st = styleOf(shape);
  const pad = stickyPad(box);
  const textRef = useRef<HTMLDivElement>(null);
  const text = shape.text ?? "";
  useLayoutEffect(() => {
    const el = textRef.current;
    if (el) fitFont(el, box.h - pad * 2, stickyMaxFont(box), STICKY_MIN_FONT);
  }, [text, box.w, box.h, pad, box]);
  return (
    <div
      data-board-shape={shape.id}
      data-board-sticky
      className="absolute flex max-w-none flex-col justify-center overflow-hidden rounded-[3px] transition-opacity data-[erasing]:opacity-25"
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        padding: pad,
        background: stickyColorCss(st.sticky),
        color: STICKY_INK,
        opacity: st.opacity,
        boxShadow: "0 1px 2px hsl(0 0% 0% / 0.10), 0 6px 16px -4px hsl(0 0% 0% / 0.18)",
      }}
    >
      {!editing && (
        <div
          ref={textRef}
          className="w-full whitespace-pre-wrap break-words font-medium leading-snug [overflow-wrap:anywhere]"
          style={{ textAlign: alignOf(st.textAlign) }}
        >
          {text}
        </div>
      )}
    </div>
  );
}

/**
 * Typing on a sticky. Esc, ⌘Enter or clicking away keeps the words (ONE undo
 * step); Tab keeps them and starts the next sticky to the right (Miro).
 */
export function StickyEditor({ shape, board }: { shape: BoardShape; board: AnyBoard }) {
  const store = useBoardCameraStore();
  const [value, setValue] = useState(shape.text ?? "");
  const box = boundsOfPoints(shape.points);
  const st = styleOf(shape);
  const pad = stickyPad(box);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const latest = useRef({ value, shape });
  useLayoutEffect(() => {
    latest.current = { value, shape };
    const el = ref.current;
    if (el) fitFont(el, box.h - pad * 2, stickyMaxFont(box), STICKY_MIN_FONT);
  });
  const commit = () => {
    if (done.current) return;
    done.current = true;
    const { value: text, shape: now } = latest.current;
    if (text !== (now.text ?? "")) board.updateShape(now.id, { text });
    if (store.getEditing() === now.id) store.setEditing(null);
  };
  const commitRef = useRef(commit);
  useLayoutEffect(() => {
    commitRef.current = commit;
  });
  useEffect(() => () => commitRef.current(), []);
  return (
    <div
      className="absolute flex max-w-none flex-col justify-center"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, padding: pad }}
    >
      {/* ui-exception: typing straight onto a sticky note on the canvas (FigJam / Miro); a ProTextarea's chrome would cover the card */}
      <textarea
        ref={ref}
        data-board-shape-editor
        aria-label="Sticky note"
        autoFocus
        value={value}
        rows={1}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => {
          const end = e.currentTarget.value.length;
          e.currentTarget.setSelectionRange(end, end);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
            e.preventDefault();
            e.stopPropagation();
            commit();
            return;
          }
          if (e.key === "Tab" && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            commit();
            const next = nextStickyBeside(latest.current.shape);
            board.addShape(next);
            store.select(next.id);
            store.setEditing(next.id);
          }
        }}
        className="pointer-events-auto max-h-full w-full resize-none overflow-hidden border-0 bg-transparent p-0 font-medium leading-snug outline-none [overflow-wrap:anywhere]"
        style={{ textAlign: alignOf(st.textAlign), color: STICKY_INK, fieldSizing: "content" } as React.CSSProperties}
      />
    </div>
  );
}

// ── plain text ───────────────────────────────────────────────────────────────

const textStyle = (st: ShapeStyle): React.CSSProperties => ({
  fontSize: TEXT_SIZES[st.textSize],
  fontWeight: st.textWeight === "bold" ? 700 : 500,
  lineHeight: 1.3,
  textAlign: alignOf(st.textAlign),
  color: shapeColorCss(st.stroke),
});

/**
 * Plain text as drawn. It measures itself after each change and records its
 * box on the shape (no undo step), so selection, snapping and the marquee see
 * exactly the words: as wide as the longest line until it is given a width,
 * then that width and as tall as its wrapped lines.
 */
export function PlainText({ shape, box, board, editing }: { shape: BoardShape; box: Rect; board: AnyBoard; editing: boolean }) {
  const st = styleOf(shape);
  const ref = useRef<HTMLDivElement>(null);
  const text = shape.text ?? "";
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || editing) return;
    const w = shape.wrap ? box.w : el.offsetWidth;
    const h = el.offsetHeight;
    if (!w || !h) return; // not laid out (a hidden tab, a test without layout)
    if (Math.abs(w - box.w) > 0.5 || Math.abs(h - box.h) > 0.5) {
      board.stampShape(shape.id, { points: [{ x: box.x, y: box.y }, { x: box.x + w, y: box.y + h }] });
    }
  });
  return (
    <div
      ref={ref}
      data-board-shape={shape.id}
      data-board-text
      className="absolute max-w-none transition-opacity data-[erasing]:opacity-25"
      style={{
        left: box.x,
        top: box.y,
        width: shape.wrap ? box.w : "max-content",
        whiteSpace: shape.wrap ? "pre-wrap" : "pre",
        overflowWrap: shape.wrap ? "anywhere" : undefined,
        opacity: editing ? 0 : st.opacity,
        ...textStyle(st),
      }}
    >
      {text || <span className="text-muted-foreground/60">Text</span>}
    </div>
  );
}

/**
 * Typing plain text. Esc, ⌘Enter or clicking away keeps it (ONE undo step);
 * text left empty is removed (tldraw).
 */
export function PlainTextEditor({ shape, board }: { shape: BoardShape; board: AnyBoard }) {
  const store = useBoardCameraStore();
  const [value, setValue] = useState(shape.text ?? "");
  const box = boundsOfPoints(shape.points);
  const st = styleOf(shape);
  const done = useRef(false);
  const latest = useRef({ value, shape });
  useLayoutEffect(() => {
    latest.current = { value, shape };
  });
  const commit = () => {
    if (done.current) return;
    done.current = true;
    const { value: text, shape: now } = latest.current;
    if (!text.trim()) board.removeMany([now.id]);
    else if (text !== (now.text ?? "")) board.updateShape(now.id, { text });
    if (store.getEditing() === now.id) store.setEditing(null);
  };
  const commitRef = useRef(commit);
  useLayoutEffect(() => {
    commitRef.current = commit;
  });
  useEffect(() => () => commitRef.current(), []);
  return (
    // ui-exception: plain text typed straight onto the canvas (tldraw / Figma); a ProTextarea's chrome is exactly what canvas text must not have
    <textarea
      data-board-shape-editor
      aria-label="Text"
      autoFocus
      value={value}
      rows={1}
      placeholder="Text"
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => {
        const end = e.currentTarget.value.length;
        e.currentTarget.setSelectionRange(end, end);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          e.stopPropagation();
          commit();
        }
      }}
      className="pointer-events-auto absolute max-w-none resize-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:text-muted-foreground/60"
      style={
        {
          left: box.x,
          top: box.y,
          width: shape.wrap ? box.w : undefined,
          minWidth: shape.wrap ? undefined : "1ch",
          whiteSpace: shape.wrap ? "pre-wrap" : "pre",
          fieldSizing: "content",
          ...textStyle(st),
        } as React.CSSProperties
      }
    />
  );
}
