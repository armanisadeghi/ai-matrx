"use client";

/**
 * ShapesLayer — the drawings on the board (rectangles, ovals, lines, arrows,
 * pen strokes) as first-class objects, in WORLD space, drawn ABOVE the tiles
 * (z-order: frames < tiles < drawings), so a stroke over a tile stays visible.
 *
 * The layer itself takes no pointer input: the viewport hit-tests presses in
 * JS through `store.setShapeHost` (`engine/shapes.ts` `topShapeAt`), so a
 * click INSIDE a hollow rectangle or NEAR a 2px stroke selects it, and the
 * selection, marquee, ⌘A, group move, nudge, Delete and undo are the tiles'
 * own (each shape registers in the camera store as a mark).
 *
 * Reads its own channel (`board.subscribeShapes`): dragging a drawing
 * re-renders this layer and nothing else on the board.
 *
 * A lone selected shape shows its handles: eight for a rectangle, oval or pen
 * stroke (a stroke scales with its box), two end handles for a line or arrow —
 * drop an end on a tile or a box shape and it binds and follows it. Double-
 * click (or Enter on) a rectangle or oval types centred text.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { BoardStore, BoardTileBase } from "../board/board-store";
import { useBoardTile } from "../board/useBoard";
import { screenToWorld, type Rect } from "../engine/camera";
import { useBoardCameraStore, useEditingTile, useIsEditing, useSelectedTile } from "../engine/react";
import {
  type BoardShape,
  type Point,
  FILL_ALPHA,
  TEXT_SIZES,
  boundsOfPoints,
  dashArray,
  drawnPoints,
  hitShape,
  isBoxKind,
  isConnector,
  shapeColorCss,
  strokeWidthOf,
  styleOf,
  textCapable,
  topShapeAt,
} from "../engine/shapes";
import { startPointerGesture } from "../engine/pointer-gesture";
import { isFrameKey } from "../engine/selection";
import { ResizeHandles } from "./BoardTile";

/** Screen px a press may miss a thin stroke by and still hit it. */
export const SHAPE_HIT_SLOP_PX = 6;
const SHAPE_MIN_SIZE = { w: 8, h: 8 };

type AnyBoard = BoardStore<BoardTileBase>;

export function ShapesLayer<T extends BoardTileBase>({ board }: { board: BoardStore<T> }) {
  const store = useBoardCameraStore();
  const b = board as unknown as AnyBoard;
  const shapes = useSyncExternalStore(b.subscribeShapes, b.getShapes, b.getShapes);
  useEffect(
    () =>
      store.setShapeHost({
        hit: (p, tolerance, opts) => topShapeAt(b.getShapes(), p, tolerance, b.targetOf, opts),
        editable: (id) => {
          const s = b.getShape(id);
          return !!s && textCapable(s.kind);
        },
      }),
    [store, b],
  );
  return (
    <div data-board-shapes className="pointer-events-none absolute left-0 top-0 z-[6] h-px w-px max-w-none overflow-visible">
      {shapes.map((s) => (
        <ShapeView key={s.id} shape={s} board={b} />
      ))}
      <ShapeChrome board={b} shapes={shapes} />
    </div>
  );
}

/** A shape's drawn points, re-read when a tile it is bound to moves. */
function useDrawnPoints(shape: BoardShape, board: AnyBoard): Point[] {
  // Subscribing to the bound tiles' records wakes this shape (only) when one moves.
  useBoardTile(board, shape.bind?.start ?? "");
  useBoardTile(board, shape.bind?.end ?? "");
  return drawnPoints(shape, board.targetOf);
}

function ShapeView({ shape, board }: { shape: BoardShape; board: AnyBoard }) {
  const store = useBoardCameraStore();
  const pts = useDrawnPoints(shape, board);
  const box = boundsOfPoints(pts);
  const editing = useIsEditing(shape.id);
  const boxRef = useRef(box);
  useEffect(() => {
    boxRef.current = box;
  });
  // Registered once as a MARK (selectable, fitted, on the minimap; never a tile's life or focus);
  // a move UPDATES, so a drag never drops the selection.
  useEffect(() => store.registerItem(shape.id, boxRef.current, { mark: true }), [store, shape.id]);
  const boxKey = `${box.x},${box.y},${box.w},${box.h}`;
  useEffect(() => store.updateItem(shape.id, boxRef.current), [store, shape.id, boxKey]);

  const st = styleOf(shape);
  const width = strokeWidthOf(shape);
  const stroke = shapeColorCss(st.stroke);
  const fill = st.fill === "none" ? "none" : shapeColorCss(st.fill, FILL_ALPHA);
  const common = {
    stroke,
    strokeWidth: width,
    strokeDasharray: dashArray(st.dash, width),
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let body: React.ReactNode;
  switch (shape.kind) {
    case "rect":
      body = <rect {...common} fill={fill} x={box.x} y={box.y} width={box.w} height={box.h} rx={Math.min(12, box.w / 4, box.h / 4)} />;
      break;
    case "oval":
      body = <ellipse {...common} fill={fill} cx={box.x + box.w / 2} cy={box.y + box.h / 2} rx={box.w / 2} ry={box.h / 2} />;
      break;
    case "line":
      body = <line {...common} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
      break;
    case "arrow":
      body = (
        <>
          <line {...common} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          <path {...common} strokeDasharray={undefined} fill="none" d={arrowHead(a, b, width)} />
        </>
      );
      break;
    case "pen":
      body = <polyline {...common} fill="none" points={pts.map((p) => `${p.x},${p.y}`).join(" ")} />;
      break;
  }
  const text = textCapable(shape.kind) && shape.text && !editing ? shape.text : null;
  return (
    <>
      <svg
        data-board-shape={shape.id}
        aria-hidden
        className="absolute left-0 top-0 h-px w-px max-w-none overflow-visible transition-opacity data-[erasing]:opacity-25"
        style={{ opacity: st.opacity }}
      >
        {body}
      </svg>
      {text && <ShapeText box={box} shape={shape}>{text}</ShapeText>}
    </>
  );
}

/** An open arrowhead at `b`, pointing away from `a` (tldraw). */
function arrowHead(a: Point, b: Point, width: number): string {
  const len = Math.max(14, width * 4);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const wing = (d: number) => ({ x: b.x - len * Math.cos(ang + d), y: b.y - len * Math.sin(ang + d) });
  const l = wing(Math.PI / 7);
  const r = wing(-Math.PI / 7);
  return `M ${l.x} ${l.y} L ${b.x} ${b.y} L ${r.x} ${r.y}`;
}

function ShapeText({ box, shape, children }: { box: Rect; shape: BoardShape; children: React.ReactNode }) {
  const st = styleOf(shape);
  return (
    <div
      className="absolute flex max-w-none items-center overflow-hidden whitespace-pre-wrap break-words p-2 font-medium leading-snug"
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        fontSize: TEXT_SIZES[st.textSize],
        textAlign: st.textAlign === "start" ? "left" : st.textAlign === "end" ? "right" : "center",
        justifyContent: st.textAlign === "start" ? "flex-start" : st.textAlign === "end" ? "flex-end" : "center",
        color: shapeColorCss(st.stroke),
        opacity: st.opacity,
      }}
    >
      <span className="block w-full">{children}</span>
    </div>
  );
}

/** The lone selected shape's handles, and the text editor while one is being typed in. */
function ShapeChrome({ board, shapes }: { board: AnyBoard; shapes: readonly BoardShape[] }) {
  const selected = useSelectedTile();
  const editing = useEditingTile();
  const shape = selected ? shapes.find((s) => s.id === selected) : undefined;
  if (!shape) return null;
  if (editing === shape.id && textCapable(shape.kind)) return <ShapeTextEditor key={shape.id} shape={shape} board={board} />;
  return isConnector(shape.kind) ? <EndHandles shape={shape} board={board} /> : <BoxHandles shape={shape} board={board} />;
}

function BoxHandles({ shape, board }: { shape: BoardShape; board: AnyBoard }) {
  const box = boundsOfPoints(shape.points);
  return (
    <div className="absolute max-w-none" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
      <div
        aria-hidden
        className="pointer-events-none absolute max-w-none rounded-[2px] border-primary"
        style={{ inset: "calc(-4px / var(--board-z, 1))", borderWidth: "calc(1.5px / var(--board-z, 1))", borderStyle: "solid" }}
      />
      <div className="pointer-events-auto">
        <ResizeHandles id={shape.id} rect={box} selected onResize={board.resizeShape} min={SHAPE_MIN_SIZE} />
      </div>
    </div>
  );
}

/** A tile or a rectangle / oval under a world point (not `self`) — what a dropped end binds to. */
function bindTargetAt(board: AnyBoard, items: ReadonlyMap<string, Rect>, isMark: (id: string) => boolean, p: Point, self: string): string | null {
  const shapes = board.getShapes();
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (s.id === self || !isBoxKind(s.kind)) continue;
    if (hitShape(s, p, 0, board.targetOf)) return s.id;
  }
  let hit: string | null = null;
  for (const [id, r] of items) {
    if (id === self || isFrameKey(id) || isMark(id)) continue;
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) hit = id;
  }
  return hit;
}

function EndHandles({ shape, board }: { shape: BoardShape; board: AnyBoard }) {
  const store = useBoardCameraStore();
  const pts = useDrawnPoints(shape, board);
  const [target, setTarget] = useState<string | null>(null);
  const gesture = useRef<(() => void) | null>(null);
  useEffect(() => () => gesture.current?.(), []);
  const ends: ["start" | "end", Point][] = [
    ["start", pts[0]],
    ["end", pts[pts.length - 1]],
  ];

  const begin = (end: "start" | "end") => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
    const root = e.currentTarget.closest<HTMLElement>("[data-board-root]");
    if (!root) return;
    gesture.current?.();
    const startPoints = shape.points;
    const startBind = shape.bind;
    gesture.current = startPointerGesture(e.nativeEvent, e.currentTarget, {
      onMove: (m) => {
        const box = root.getBoundingClientRect();
        const p = screenToWorld(store.getCamera(), m.clientX - box.left, m.clientY - box.top);
        const bindTo = m.altKey ? null : bindTargetAt(board, store.getItems(), store.isMark, p, shape.id);
        setTarget(bindTo);
        board.setShapeEnd(shape.id, end, p, bindTo);
      },
      onEnd: (how) => {
        gesture.current = null;
        setTarget(null);
        if (how === "escape") board.updateShape(shape.id, { points: startPoints, bind: startBind ?? {} });
      },
    });
  };

  const size = "calc(12px / var(--board-z, 1))";
  const targetRect = target ? store.getItems().get(target) : undefined;
  return (
    <>
      {targetRect && (
        <div
          aria-hidden
          className="pointer-events-none absolute max-w-none rounded-md border-primary bg-primary/5"
          style={{
            left: targetRect.x,
            top: targetRect.y,
            width: targetRect.w,
            height: targetRect.h,
            borderWidth: "calc(2px / var(--board-z, 1))",
            borderStyle: "solid",
          }}
        />
      )}
      {ends.map(([end, p]) => (
        <div
          key={end}
          data-board-resize={`end-${end}`}
          aria-hidden
          onPointerDown={begin(end)}
          className="pointer-events-auto absolute max-w-none touch-none rounded-full border-primary bg-card"
          style={{
            left: p.x,
            top: p.y,
            width: size,
            height: size,
            transform: "translate(-50%, -50%)",
            borderWidth: "calc(2px / var(--board-z, 1))",
            borderStyle: "solid",
            cursor: "crosshair",
          }}
        />
      ))}
    </>
  );
}

/**
 * Typing in a rectangle or oval (double-click it, or Enter). Esc, ⌘Enter or
 * clicking away keeps the text; it is ONE undo step.
 */
function ShapeTextEditor({ shape, board }: { shape: BoardShape; board: AnyBoard }) {
  const store = useBoardCameraStore();
  const [value, setValue] = useState(shape.text ?? "");
  const box = boundsOfPoints(shape.points);
  const st = styleOf(shape);
  const done = useRef(false);
  const latest = useRef({ value, shape });
  useEffect(() => {
    latest.current = { value, shape };
  });
  const commit = () => {
    if (done.current) return;
    done.current = true;
    const { value: text, shape: now } = latest.current;
    if (text !== (now.text ?? "")) board.updateShape(now.id, { text });
    if (store.getEditing() === now.id) store.setEditing(null);
  };
  // A press on empty board (or any deselect) unmounts the editor without a blur: keep the text.
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });
  useEffect(() => () => commitRef.current(), []);
  return (
    <div
      className="absolute flex max-w-none items-center p-2"
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        justifyContent: st.textAlign === "start" ? "flex-start" : st.textAlign === "end" ? "flex-end" : "center",
      }}
    >
      {/* ui-exception: on-canvas shape label typed in place (tldraw / FigJam); a ProTextarea's chrome would sit over the drawing */}
      <textarea
        data-board-shape-editor
        aria-label="Shape text"
        autoFocus
        value={value}
        rows={1}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
            e.preventDefault();
            e.stopPropagation();
            commit();
          }
        }}
        className="pointer-events-auto max-h-full w-full resize-none overflow-hidden border-0 bg-transparent p-0 font-medium leading-snug outline-none"
        style={{
          fontSize: TEXT_SIZES[st.textSize],
          textAlign: st.textAlign === "start" ? "left" : st.textAlign === "end" ? "right" : "center",
          color: shapeColorCss(st.stroke),
          fieldSizing: "content",
        } as React.CSSProperties}
      />
    </div>
  );
}
