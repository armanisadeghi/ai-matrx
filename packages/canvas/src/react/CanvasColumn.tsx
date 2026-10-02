"use client";

/**
 * The canvas column: full height, right edge, its own strip of the top of the
 * window. Width drags from the left edge; panes split in either direction; full
 * screen takes the whole frame. On a phone it becomes a full-screen layer.
 *
 * Hosts with their own shell place <CanvasColumn/> in a grid track and read
 * `useCanvasColumnWidth()` for the track size. Hosts without one wrap their app
 * in <CanvasFrame>.
 */

import { useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { TapTargetButtonTransparent } from "@ai-matrx/tap-target";
import {
  CANVAS_MIN_WIDTH,
  selectCanvasIsFullscreen,
  selectCanvasIsOpen,
  selectCanvasItemCount,
  selectCanvasLayout,
  selectCanvasWidth,
  type CanvasLayoutNode,
} from "../index";
import { CanvasPaneView } from "./CanvasPane";
import { PanelRightIcon } from "./icons";
import { useCanvas, useCanvasState, useRegisterCanvasPresence } from "./provider";

/** Room always left for the app beside the canvas (desktop). */
const MIN_MAIN_WIDTH = 420;

function subscribeViewport(listener: () => void) {
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
}

/** The window's width, live; 0 during server render. */
function useViewportWidth(): number {
  return useSyncExternalStore(subscribeViewport, () => window.innerWidth, () => 0);
}

/**
 * The stored width, fitted to the window right now: the app beside the canvas
 * always keeps MIN_MAIN_WIDTH. A width remembered on a wide monitor never
 * crushes the app on a laptop.
 */
function fitWidth(width: number, viewport: number): number {
  if (viewport <= 0) return width;
  return Math.max(CANVAS_MIN_WIDTH, Math.min(width, viewport - MIN_MAIN_WIDTH));
}

/** The column's rendered width in px: 0 when put away, null when full screen. */
export function useCanvasColumnWidth(): number | null {
  const isOpen = useCanvasState(selectCanvasIsOpen);
  const isFullscreen = useCanvasState(selectCanvasIsFullscreen);
  const width = useCanvasState(selectCanvasWidth);
  const viewport = useViewportWidth();
  if (!isOpen) return 0;
  if (isFullscreen) return null;
  return fitWidth(width, viewport);
}

export interface CanvasColumnProps {
  readonly className?: string;
  readonly style?: CSSProperties;
  /** Called with the live width while the edge is dragged, then null — lets a host shell reflow in step. */
  readonly onLiveWidth?: (width: number | null) => void;
}

export function CanvasColumn({ className, style, onLiveWidth }: CanvasColumnProps) {
  const isOpen = useCanvasState(selectCanvasIsOpen);
  const isFullscreen = useCanvasState(selectCanvasIsFullscreen);
  const width = useCanvasState(selectCanvasWidth);
  const layout = useCanvasState(selectCanvasLayout);
  const viewport = useViewportWidth();
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  useRegisterCanvasPresence();

  if (!isOpen) return null;
  const fitted = fitWidth(width, viewport);
  const shown = dragWidth ?? fitted;

  return (
    <aside
      className={["mxc-column", className].filter(Boolean).join(" ")}
      data-fullscreen={isFullscreen ? "" : undefined}
      aria-label="Canvas"
      style={{ ...style, ["--mxc-width" as string]: `${shown}px` }}
    >
      {!isFullscreen ? (
        <WidthHandle
          width={fitted}
          onDrag={(next) => {
            setDragWidth(next);
            onLiveWidth?.(next);
          }}
        />
      ) : null}
      <div className="mxc-layout">
        <LayoutNodeView node={layout} />
      </div>
    </aside>
  );
}

function WidthHandle({ width, onDrag }: { width: number; onDrag: (width: number | null) => void }) {
  const canvas = useCanvas();
  const start = useRef<{ x: number; width: number } | null>(null);

  const clamp = (next: number) => {
    const max = Math.max(CANVAS_MIN_WIDTH, window.innerWidth - MIN_MAIN_WIDTH);
    return Math.min(max, Math.max(CANVAS_MIN_WIDTH, next));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, width };
    document.documentElement.dataset.mxcResizing = "";
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    onDrag(clamp(start.current.width + (start.current.x - event.clientX)));
  };
  const finish = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const next = clamp(start.current.width + (start.current.x - event.clientX));
    start.current = null;
    delete document.documentElement.dataset.mxcResizing;
    onDrag(null);
    canvas.setWidth(next);
  };

  return (
    <div
      className="mxc-width-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize canvas"
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onDoubleClick={() => canvas.setWidth(Math.round(window.innerWidth / 2))}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") canvas.setWidth(clamp(width + 32));
        if (event.key === "ArrowRight") canvas.setWidth(clamp(width - 32));
      }}
    />
  );
}

function LayoutNodeView({ node }: { node: CanvasLayoutNode }) {
  if (node.type === "pane") return <CanvasPaneView paneId={node.paneId} />;
  return <SplitView node={node} />;
}

function SplitView({ node }: { node: Extract<CanvasLayoutNode, { type: "split" }> }) {
  const canvas = useCanvas();
  const ref = useRef<HTMLDivElement>(null);
  const [liveSizes, setLiveSizes] = useState<readonly number[] | null>(null);
  const sizes = liveSizes ?? node.sizes;
  const horizontal = node.orientation === "horizontal";

  const beginDrag = (index: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = el.getBoundingClientRect();
    const total = horizontal ? rect.width : rect.height;
    const origin = horizontal ? event.clientX : event.clientY;
    const base = [...node.sizes];
    const pair = (base[index] ?? 0) + (base[index + 1] ?? 0);
    const target = event.currentTarget;
    document.documentElement.dataset.mxcResizing = "";

    const compute = (pos: number) => {
      const delta = (pos - origin) / total;
      const min = 0.12;
      const first = Math.min(pair - min, Math.max(min, (base[index] ?? 0) + delta));
      const next = [...base];
      next[index] = first;
      next[index + 1] = pair - first;
      return next;
    };
    const move = (e: PointerEvent) => setLiveSizes(compute(horizontal ? e.clientX : e.clientY));
    const up = (e: PointerEvent) => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      delete document.documentElement.dataset.mxcResizing;
      setLiveSizes(null);
      canvas.resizeSplit(node.id, compute(horizontal ? e.clientX : e.clientY));
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  return (
    <div ref={ref} className="mxc-split" data-orientation={node.orientation}>
      {node.children.map((child, i) => (
        <SplitChild
          key={child.type === "pane" ? child.paneId : child.id}
          size={sizes[i] ?? 1 / node.children.length}
          handle={
            i < node.children.length - 1 ? (
              <div
                className="mxc-split-handle"
                role="separator"
                aria-orientation={horizontal ? "vertical" : "horizontal"}
                onPointerDown={beginDrag(i)}
                onDoubleClick={() => canvas.resizeSplit(node.id, node.children.map(() => 1 / node.children.length))}
              />
            ) : null
          }
        >
          <LayoutNodeView node={child} />
        </SplitChild>
      ))}
    </div>
  );
}

function SplitChild({ size, handle, children }: { size: number; handle: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="mxc-split-child" style={{ flexGrow: size, flexBasis: 0 }}>
        {children}
      </div>
      {handle}
    </>
  );
}

/** THE one button that opens and puts away the canvas. */
export function CanvasToggle({ className }: { className?: string }) {
  const canvas = useCanvas();
  const isOpen = useCanvasState(selectCanvasIsOpen);
  const count = useCanvasState(selectCanvasItemCount);
  return (
    <span className={["mxc-toggle", className].filter(Boolean).join(" ")} data-open={isOpen ? "" : undefined}>
      <TapTargetButtonTransparent
        ariaLabel={isOpen ? "Hide canvas" : "Show canvas"}
        tooltip={isOpen ? "Hide canvas (⌘\\)" : "Show canvas (⌘\\)"}
        icon={<PanelRightIcon />}
        onClick={() => canvas.toggle()}
      />
      {count > 0 && !isOpen ? <span className="mxc-toggle-badge">{count}</span> : null}
    </span>
  );
}

/**
 * For hosts without their own shell (a Vite app, an Electron window): the app
 * on the left, the canvas column on the right, full screen handled.
 */
export function CanvasFrame({ children, className }: { children: ReactNode; className?: string }) {
  const isFullscreen = useCanvasState(selectCanvasIsFullscreen);
  const isOpen = useCanvasState(selectCanvasIsOpen);
  return (
    <div className={["mxc-frame", className].filter(Boolean).join(" ")} data-canvas-open={isOpen ? "" : undefined}>
      <div className="mxc-frame-main" hidden={isOpen && isFullscreen}>
        {children}
      </div>
      <CanvasColumn />
    </div>
  );
}
