"use client";

/**
 * QuadEditor — draggable 4-corner crop overlay with zoom.
 *
 * Coordinate spaces:
 * - "content" — the displayed image's natural pixels (the caller maps
 *   rotation; this component is rotation-agnostic).
 * - "screen"  — viewport pixels after zoom/pan.
 *
 * Guarantees:
 * - All 4 handles are ALWAYS visible: they render in a screen-space
 *   overlay OUTSIDE the clipped image layer, and every quad change
 *   (detection, full-frame, drag release) auto-fits zoom/pan so the
 *   quad + margin fits the viewport — dragging a corner outward zooms
 *   back out on release.
 * - Pinch (two pointers) and wheel zoom, drag-to-pan when zoomed,
 *   double-tap/double-click resets.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

import type { Quad, QuadPoint } from "../types";

const CORNERS = [
  "top_left",
  "top_right",
  "bottom_right",
  "bottom_left",
] as const;
type CornerName = (typeof CORNERS)[number];

const MAX_ZOOM = 6;
const FIT_MARGIN = 0.12; // quad bbox margin when auto-fitting

interface QuadEditorProps {
  imageUrl: string;
  /** Displayed image's natural dimensions (content space). */
  naturalWidth: number;
  naturalHeight: number;
  /** Viewport size in CSS px — the caller fits this to the drawer. */
  viewportWidth: number;
  viewportHeight: number;
  /** Current quad in content pixels. */
  quad: Quad;
  onChange: (quad: Quad) => void;
  className?: string;
}

interface ViewTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export function QuadEditor({
  imageUrl,
  naturalWidth,
  naturalHeight,
  viewportWidth,
  viewportHeight,
  quad,
  onChange,
  className,
}: QuadEditorProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewTransform>({ zoom: 1, panX: 0, panY: 0 });
  const [animating, setAnimating] = useState(false);
  const [dragging, setDragging] = useState<CornerName | null>(null);

  // Live mirrors for pointer-event closures (registered once per gesture).
  // Synced post-render (an effect) — never written during render.
  const viewRef = useRef(view);
  const quadLiveRef = useRef(quad);
  useEffect(() => {
    viewRef.current = view;
    quadLiveRef.current = quad;
  });

  const contentToScreen = useCallback(
    (p: QuadPoint, v: ViewTransform): QuadPoint => [
      (p[0] / naturalWidth) * viewportWidth * v.zoom + v.panX,
      (p[1] / naturalHeight) * viewportHeight * v.zoom + v.panY,
    ],
    [naturalWidth, naturalHeight, viewportWidth, viewportHeight],
  );

  const screenToContent = useCallback(
    (sx: number, sy: number, v: ViewTransform): QuadPoint => [
      Math.min(
        Math.max(((sx - v.panX) / v.zoom / viewportWidth) * naturalWidth, 0),
        naturalWidth,
      ),
      Math.min(
        Math.max(((sy - v.panY) / v.zoom / viewportHeight) * naturalHeight, 0),
        naturalHeight,
      ),
    ],
    [naturalWidth, naturalHeight, viewportWidth, viewportHeight],
  );

  const clampView = useCallback(
    (v: ViewTransform): ViewTransform => {
      const zoom = Math.min(Math.max(v.zoom, 1), MAX_ZOOM);
      const minPanX = viewportWidth * (1 - zoom);
      const minPanY = viewportHeight * (1 - zoom);
      return {
        zoom,
        panX: Math.min(Math.max(v.panX, minPanX), 0),
        panY: Math.min(Math.max(v.panY, minPanY), 0),
      };
    },
    [viewportWidth, viewportHeight],
  );

  /** Fit the quad's bbox (+margin) into the viewport, animated. */
  const fitToQuad = useCallback(
    (q: Quad) => {
      const xs = CORNERS.map((c) => q[c][0]);
      const ys = CORNERS.map((c) => q[c][1]);
      const pad = FIT_MARGIN;
      const x0 = Math.max(0, Math.min(...xs) - naturalWidth * pad);
      const x1 = Math.min(naturalWidth, Math.max(...xs) + naturalWidth * pad);
      const y0 = Math.max(0, Math.min(...ys) - naturalHeight * pad);
      const y1 = Math.min(naturalHeight, Math.max(...ys) + naturalHeight * pad);
      // bbox in base (zoom=1) screen coords
      const bx = (x0 / naturalWidth) * viewportWidth;
      const by = (y0 / naturalHeight) * viewportHeight;
      const bw = ((x1 - x0) / naturalWidth) * viewportWidth;
      const bh = ((y1 - y0) / naturalHeight) * viewportHeight;
      const zoom = Math.min(
        Math.max(Math.min(viewportWidth / bw, viewportHeight / bh), 1),
        MAX_ZOOM,
      );
      const panX = viewportWidth / 2 - (bx + bw / 2) * zoom;
      const panY = viewportHeight / 2 - (by + bh / 2) * zoom;
      setAnimating(true);
      setView(clampView({ zoom, panX, panY }));
      window.setTimeout(() => setAnimating(false), 280);
    },
    [naturalWidth, naturalHeight, viewportWidth, viewportHeight, clampView],
  );

  // Auto-fit whenever the quad changes from OUTSIDE a drag (detection
  // result, Try again, Full frame, item switch) — and on mount.
  const draggingRef = useRef(false);
  const quadKey = CORNERS.map((c) => quad[c].join(",")).join(";");
  useEffect(() => {
    if (draggingRef.current) return;
    fitToQuad(quadLiveRef.current);
     
  }, [quadKey, viewportWidth, viewportHeight]);

  // ── Corner dragging ────────────────────────────────────────────────────
  const startCornerDrag = useCallback(
    (corner: CornerName) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      draggingRef.current = true;
      setDragging(corner);
      const startQuad = quadLiveRef.current;

      const move = (ev: PointerEvent) => {
        const rect = viewportRef.current?.getBoundingClientRect();
        if (!rect) return;
        const p = screenToContent(
          ev.clientX - rect.left,
          ev.clientY - rect.top,
          viewRef.current,
        );
        onChange({ ...startQuad, [corner]: p });
      };
      const up = () => {
        draggingRef.current = false;
        setDragging(null);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        // Release → refit so an outward drag zooms back out and every
        // handle is visible again.
        fitToQuad(quadLiveRef.current);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [onChange, screenToContent, fitToQuad],
  );

  // ── Pinch zoom + pan on the image layer ────────────────────────────────
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchStartRef = useRef<{
    dist: number;
    view: ViewTransform;
    midX: number;
    midY: number;
  } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; view: ViewTransform } | null>(
    null,
  );
  const lastTapRef = useRef(0);

  const handleLayerPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const local = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      pointersRef.current.set(e.pointerId, local);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      if (pointersRef.current.size === 2) {
        const [a, b] = Array.from(pointersRef.current.values());
        pinchStartRef.current = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          view: viewRef.current,
          midX: (a.x + b.x) / 2,
          midY: (a.y + b.y) / 2,
        };
        panStartRef.current = null;
      } else if (pointersRef.current.size === 1) {
        // Double-tap reset
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
          setAnimating(true);
          setView({ zoom: 1, panX: 0, panY: 0 });
          window.setTimeout(() => setAnimating(false), 280);
        }
        lastTapRef.current = now;
        if (viewRef.current.zoom > 1) {
          panStartRef.current = { ...local, view: viewRef.current };
        }
      }
    },
    [],
  );

  const handleLayerPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect || !pointersRef.current.has(e.pointerId)) return;
      const local = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      pointersRef.current.set(e.pointerId, local);

      if (pointersRef.current.size === 2 && pinchStartRef.current) {
        const [a, b] = Array.from(pointersRef.current.values());
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const start = pinchStartRef.current;
        const factor = dist / Math.max(start.dist, 1);
        const zoom = start.view.zoom * factor;
        // Keep the pinch midpoint stationary.
        const panX = start.midX - (start.midX - start.view.panX) * (zoom / start.view.zoom);
        const panY = start.midY - (start.midY - start.view.panY) * (zoom / start.view.zoom);
        setView(clampView({ zoom, panX, panY }));
      } else if (pointersRef.current.size === 1 && panStartRef.current) {
        const start = panStartRef.current;
        setView(
          clampView({
            zoom: start.view.zoom,
            panX: start.view.panX + (local.x - start.x),
            panY: start.view.panY + (local.y - start.y),
          }),
        );
      }
    },
    [clampView],
  );

  const handleLayerPointerUp = useCallback((e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchStartRef.current = null;
    if (pointersRef.current.size === 0) panStartRef.current = null;
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const local = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const cur = viewRef.current;
      const zoom = cur.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15);
      const panX = local.x - (local.x - cur.panX) * (zoom / cur.zoom);
      const panY = local.y - (local.y - cur.panY) * (zoom / cur.zoom);
      setView(clampView({ zoom, panX, panY }));
    },
    [clampView],
  );

  const polygon = CORNERS.map((c) => quad[c].join(",")).join(" ");
  const transition = animating ? "transform 0.25s ease-out" : undefined;

  return (
    <div
      ref={viewportRef}
      className={cn("relative select-none", className)}
      style={{ width: viewportWidth, height: viewportHeight }}
    >
      {/* Clipped image + mask layer (zoom/pan applies here) */}
      <div
        className="absolute inset-0 touch-none overflow-hidden rounded-md bg-black/30"
        onPointerDown={handleLayerPointerDown}
        onPointerMove={handleLayerPointerMove}
        onPointerUp={handleLayerPointerUp}
        onPointerCancel={handleLayerPointerUp}
        onWheel={handleWheel}
      >
        <div
          className="absolute left-0 top-0 h-full w-full"
          style={{
            transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`,
            transformOrigin: "0 0",
            transition,
          }}
        >
          <img
            src={imageUrl}
            alt="Crop preview"
            className="absolute inset-0 h-full w-full object-fill"
            draggable={false}
          />
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 ${naturalWidth} ${naturalHeight}`}
            preserveAspectRatio="none"
          >
            <defs>
              <mask id="quad-cutout">
                <rect width={naturalWidth} height={naturalHeight} fill="white" />
                <polygon points={polygon} fill="black" />
              </mask>
            </defs>
            <rect
              width={naturalWidth}
              height={naturalHeight}
              fill="black"
              fillOpacity={0.5}
              mask="url(#quad-cutout)"
            />
            <polygon
              points={polygon}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      </div>

      {/* Handles: screen-space overlay, NEVER clipped by the image layer. */}
      {CORNERS.map((corner) => {
        const [sx, sy] = contentToScreen(quad[corner], view);
        return (
          <button
            key={corner}
            type="button"
            aria-label={`Drag ${corner.replace(/_/g, " ")} corner`}
            onPointerDown={startCornerDrag(corner)}
            className={cn(
              "absolute z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full",
              dragging === corner && "scale-110",
            )}
            style={{ left: sx, top: sy, transition }}
          >
            <span
              className={cn(
                "block h-5 w-5 rounded-full border-2 border-primary bg-background shadow-md",
                dragging === corner && "bg-primary",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

/** Full-frame quad for an image — the detector's "not found" fallback. */
export function fullFrameQuad(width: number, height: number): Quad {
  return {
    top_left: [0, 0],
    top_right: [width, 0],
    bottom_right: [width, height],
    bottom_left: [0, height],
  };
}
