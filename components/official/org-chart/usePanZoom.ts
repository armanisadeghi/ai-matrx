// components/official/org-chart/usePanZoom.ts
//
// Pan + zoom for a transformed "world" layer inside a viewport element.
//
// Interaction model (Figma / Miro convention, which is what a Mac trackpad
// expects): two-finger scroll PANS, pinch (or ctrl/cmd + wheel) ZOOMS toward the
// pointer, drag anywhere pans, two-finger touch pinches. A drag never turns into
// a click on the card it started on. Paperclip's org chart zooms on every wheel
// tick, which makes a trackpad user fight the chart; this does not.

"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export interface PanZoomView {
  x: number;
  y: number;
  zoom: number;
}

export interface PanZoomOptions {
  minZoom?: number;
  maxZoom?: number;
}

const DRAG_THRESHOLD = 5;

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi);
}

export function usePanZoom(
  viewportRef: RefObject<HTMLDivElement | null>,
  { minZoom = 0.15, maxZoom = 2 }: PanZoomOptions = {},
) {
  const [view, setView] = useState<PanZoomView>({ x: 0, y: 0, zoom: 1 });
  /** True while a programmatic move (fit / centre / button zoom) should glide. */
  const [smooth, setSmooth] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    startView: PanZoomView;
    startX: number;
    startY: number;
    startDist: number;
    startCenter: { x: number; y: number };
    moved: boolean;
    captured: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  /** The person has moved the view themselves — automatic re-framing stops. */
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewport({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewportRef]);

  const zoomAt = (v: PanZoomView, nextZoom: number, px: number, py: number): PanZoomView => {
    const z = clamp(nextZoom, minZoom, maxZoom);
    const s = z / v.zoom;
    return { zoom: z, x: px - s * (px - v.x), y: py - s * (py - v.y) };
  };

  // Wheel must be a non-passive native listener or preventDefault is ignored.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setSmooth(false);
      setTouched(true);
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        setView((v) => zoomAt(v, v.zoom * factor, px, py));
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // zoomAt only closes over the zoom bounds.
  }, [viewportRef, minZoom, maxZoom]);

  const localPoint = (clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  };

  const beginGesture = () => {
    const pts = [...pointers.current.values()];
    const center =
      pts.length >= 2
        ? localPoint((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2)
        : { x: 0, y: 0 };
    gesture.current = {
      startView: view,
      startX: pts[0]?.x ?? 0,
      startY: pts[0]?.y ?? 0,
      startDist: pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
      startCenter: center,
      moved: gesture.current?.moved ?? false,
      captured: gesture.current?.captured ?? false,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const target = e.target as HTMLElement;
    // Controls keep their own clicks; everything else (cards included) can pan.
    if (target.closest("button, a, input, textarea, select, [data-no-pan]")) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setSmooth(false);
    beginGesture();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const pts = [...pointers.current.values()];

    if (pts.length >= 2 && g.startDist > 0) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const center = localPoint((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      const z = clamp(g.startView.zoom * (dist / g.startDist), minZoom, maxZoom);
      const s = z / g.startView.zoom;
      g.moved = true;
      setTouched(true);
      setView({
        zoom: z,
        x: center.x - s * (g.startCenter.x - g.startView.x),
        y: center.y - s * (g.startCenter.y - g.startView.y),
      });
      return;
    }

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!g.captured) {
      // Capture only once it is a real drag, so a plain click still reaches the card.
      e.currentTarget.setPointerCapture(e.pointerId);
      g.captured = true;
    }
    g.moved = true;
    setTouched(true);
    setView({ ...g.startView, x: g.startView.x + dx, y: g.startView.y + dy });
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    if (gesture.current?.moved) suppressClick.current = true;
    if (pointers.current.size === 0) {
      gesture.current = null;
      // Clear on the next task so the click that follows this pointerup is swallowed.
      window.setTimeout(() => (suppressClick.current = false), 0);
    } else {
      beginGesture();
    }
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const size = () => ({
    w: viewportRef.current?.clientWidth ?? 0,
    h: viewportRef.current?.clientHeight ?? 0,
  });

  /** Frame a world-space box. Never zooms in past 100%. */
  const fitTo = (box: { x: number; y: number; width: number; height: number }, padding = 40) => {
    const { w, h } = size();
    if (w <= padding * 2 || h <= padding * 2 || box.width <= 0 || box.height <= 0) return false;
    const zoom = clamp(
      Math.min((w - padding * 2) / box.width, (h - padding * 2) / box.height, 1),
      minZoom,
      maxZoom,
    );
    setSmooth(true);
    setView({
      zoom,
      x: (w - box.width * zoom) / 2 - box.x * zoom,
      y: (h - box.height * zoom) / 2 - box.y * zoom,
    });
    return true;
  };

  /** Centre a world-space point, keeping (or setting) the zoom. */
  const centerOn = (wx: number, wy: number, zoom?: number) => {
    const { w, h } = size();
    setSmooth(true);
    setView((v) => {
      const z = clamp(zoom ?? v.zoom, minZoom, maxZoom);
      return { zoom: z, x: w / 2 - wx * z, y: h / 2 - wy * z };
    });
  };

  const zoomBy = (factor: number) => {
    setTouched(true);
    const { w, h } = size();
    setSmooth(true);
    setView((v) => zoomAt(v, v.zoom * factor, w / 2, h / 2));
  };

  const panBy = (dx: number, dy: number) => {
    setTouched(true);
    setSmooth(true);
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };

  return {
    view,
    /** Viewport size in CSS pixels (state, so it is safe to read in render). */
    viewport,
    touched,
    smooth,
    fitTo,
    centerOn,
    zoomBy,
    panBy,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onClickCapture,
    },
  };
}
