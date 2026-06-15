"use client";

/**
 * Bounded, fit-aware pan/zoom viewport for a rendered mermaid SVG.
 *
 * The sizing problem this solves: a diagram has its own intrinsic aspect ratio,
 * and naively fitting it to the container width either runs off the screen
 * vertically (tall flowcharts) or shrinks the text to nothing (wide mind maps).
 *
 * The fix is AXIS-AWARE FIT with a READABILITY FLOOR:
 *  - Fit the diagram's *constraining* axis to the frame and SCROLL the other:
 *    a portrait diagram fills the width and scrolls down; a landscape diagram
 *    (mind map) fills the height and scrolls across.
 *  - Never auto-shrink below `FLOOR` of natural size — below that, text is
 *    unreadable, so we keep it readable and let the user scroll/pan instead.
 *  - Never auto-upscale past natural (`MAX_FIT`) — that just blurs and wastes
 *    space; the user can zoom in deliberately.
 *
 * Scaling is applied as explicit pixel width/height on the SVG (vector-crisp,
 * gives the scroll container real content, and keeps `getScreenCTM()` honest so
 * visual-mode hit-testing stays accurate). Manual zoom (ctrl/cmd-wheel, pinch,
 * buttons) overrides the auto-fit until the user hits "Fit" again. Plain wheel
 * scrolls — an embedded diagram must never hijack page scroll.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Minus, Plus, Scan } from "lucide-react";

import { SimpleTooltip } from "@/components/matrx/Tooltip";
import { cn } from "@/lib/utils";

/** Don't auto-shrink below half natural size — readability floor. */
const FLOOR = 0.5;
/** Don't auto-upscale past natural size on fit. */
const MAX_FIT = 1;
/** Manual zoom bounds (the user may go past the auto limits deliberately). */
const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.25;
/** Breathing room inside the frame so the diagram never touches the edges. */
const FRAME_PADDING = 16;

interface NaturalSize {
  w: number;
  h: number;
}

/**
 * Axis-aware fit: constrain the limiting axis, leave the other to scroll.
 * Floored so text stays readable; capped at natural so we never upscale.
 */
function computeFitScale(nat: NaturalSize, fw: number, fh: number): number {
  if (!nat.w || !nat.h || fw <= 0 || fh <= 0) return 1;
  const frameAspect = fw / fh;
  const diagAspect = nat.w / nat.h;
  // diagram "taller" than the frame → constrain width (scroll vertically);
  // diagram "wider" than the frame → constrain height (scroll horizontally).
  const raw = diagAspect <= frameAspect ? fw / nat.w : fh / nat.h;
  return Math.min(MAX_FIT, Math.max(FLOOR, raw));
}

interface MermaidViewportProps {
  /** Rendered SVG markup (sanitized by mermaid under securityLevel strict). */
  svg: string;
  className?: string;
  /** Hide the zoom controls (e.g. tiny inline contexts, popover-open states). */
  hideControls?: boolean;
  /** Receives the live SVG element after each injection (visual-mode hook). */
  onSvgMounted?: (el: SVGSVGElement | null) => void;
  /**
   * Px cap on the frame height (chat/inline contexts). The diagram fits within
   * this height and scrolls past it. Omit + set `fillHeight` for surfaces that
   * already bound height (canvas workbench, fullscreen).
   */
  maxFrameHeight?: number;
  /** Frame fills its parent's height and fits to the measured height. */
  fillHeight?: boolean;
}

export function MermaidViewport({
  svg,
  className,
  hideControls,
  onSvgMounted,
  maxFrameHeight,
  fillHeight,
}: MermaidViewportProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const naturalRef = useRef<NaturalSize | null>(null);
  const userAdjustedRef = useRef(false);
  const lastFrameWidthRef = useRef(0);

  const [scale, setScale] = useState(1);
  const [canPan, setCanPan] = useState(false);

  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);

  /** Frame inner dimensions available for fitting (cap takes priority). */
  const frameSize = useCallback((): { fw: number; fh: number } => {
    const frame = frameRef.current;
    const fw = (frame?.clientWidth ?? 0) - FRAME_PADDING;
    const fh = (maxFrameHeight ?? frame?.clientHeight ?? 0) - FRAME_PADDING;
    return { fw: Math.max(0, fw), fh: Math.max(0, fh) };
  }, [maxFrameHeight]);

  /** Size the live SVG element to the given scale (vector-crisp, real scroll). */
  const applyScale = useCallback((s: number) => {
    const el = svgRef.current;
    const nat = naturalRef.current;
    if (!el || !nat) return;
    el.style.maxWidth = "none";
    el.style.width = `${Math.round(nat.w * s)}px`;
    el.style.height = `${Math.round(nat.h * s)}px`;
  }, []);

  /** Recompute and apply the auto-fit scale (resets the manual-override flag). */
  const fit = useCallback(() => {
    const nat = naturalRef.current;
    if (!nat) return;
    const { fw, fh } = frameSize();
    const s = computeFitScale(nat, fw, fh);
    userAdjustedRef.current = false;
    setScale(s);
  }, [frameSize]);

  const oneToOne = useCallback(() => {
    userAdjustedRef.current = true;
    setScale(1);
  }, []);

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const zoomBy = useCallback((factor: number) => {
    userAdjustedRef.current = true;
    setScale((s) => clampScale(s * factor));
  }, []);

  // Latest fit/applyScale/scale held in refs so the injection effect below can
  // call them WITHOUT depending on them — otherwise a `maxFrameHeight` change
  // (e.g. window resize) would recreate those callbacks, re-run the injection
  // effect, re-set innerHTML, and wipe the user's scroll/pan position.
  const fitRef = useRef(fit);
  const applyScaleRef = useRef(applyScale);
  const scaleRef = useRef(scale);
  useEffect(() => {
    fitRef.current = fit;
    applyScaleRef.current = applyScale;
    scaleRef.current = scale;
  });

  // Inject the SVG. This is an effect (not a ref callback) so it re-runs when
  // `svg` changes — progressive streaming re-renders swap the markup in place.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = svg;
    const el = host.querySelector("svg") as SVGSVGElement | null;
    svgRef.current = el;

    if (el) {
      el.style.display = "block";
      // Intrinsic size from the viewBox (mermaid always emits one); fall back
      // to the bounding box if a future grammar omits it.
      const vb = el.viewBox?.baseVal;
      let nat: NaturalSize | null = vb && vb.width && vb.height ? { w: vb.width, h: vb.height } : null;
      if (!nat) {
        try {
          const bb = el.getBBox();
          if (bb.width && bb.height) nat = { w: bb.width, h: bb.height };
        } catch {
          /* getBBox throws if not yet in layout — leave natural null, fall back to 1:1 */
        }
      }
      naturalRef.current = nat;
    } else {
      naturalRef.current = null;
    }

    onSvgMounted?.(el);

    // Re-fit on new content unless the user has taken manual control (via refs,
    // so a frame-height change never re-injects and wipes scroll).
    if (userAdjustedRef.current) applyScaleRef.current(scaleRef.current);
    else fitRef.current();

    return () => {
      onSvgMounted?.(null);
    };
  }, [svg, onSvgMounted]);

  // Apply scale whenever it changes (zoom buttons, fit, pinch). applyScale is
  // pure DOM (no setState), so this effect can't cascade renders.
  useEffect(() => {
    applyScale(scale);
  }, [scale, applyScale]);

  // Grab-cursor hint: observe the inner host (which resizes with the SVG) and
  // read the frame's real scroll overflow. setState in a ResizeObserver
  // callback is async — never the synchronous setState-in-effect the rules ban.
  useEffect(() => {
    const frame = frameRef.current;
    const host = hostRef.current;
    if (!frame || !host || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setCanPan(frame.scrollWidth > frame.clientWidth + 1 || frame.scrollHeight > frame.clientHeight + 1);
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  // Re-fit on frame WIDTH changes only (window resize, sidebar toggle). Height
  // is read fresh inside fit() — subscribing to height would oscillate, since
  // fitting changes the content height which changes the frame height.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const w = frame.clientWidth;
      if (w === lastFrameWidthRef.current) return;
      lastFrameWidthRef.current = w;
      if (!userAdjustedRef.current) fit();
    });
    ro.observe(frame);
    return () => ro.disconnect();
  }, [fit]);

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return; // plain wheel = native scroll
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale };
      dragRef.current = null;
      return;
    }
    if (e.button !== 0) return;
    const frame = frameRef.current;
    if (!frame) return;
    // Grab-to-pan the scroll container (only meaningful when content overflows).
    dragRef.current = { x: e.clientX, y: e.clientY, left: frame.scrollLeft, top: frame.scrollTop };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinchRef.current && pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const ratio = distance / pinchRef.current.distance;
      userAdjustedRef.current = true;
      setScale(clampScale(pinchRef.current.scale * ratio));
      return;
    }
    const drag = dragRef.current;
    const frame = frameRef.current;
    if (!drag || !frame) return;
    frame.scrollLeft = drag.left - (e.clientX - drag.x);
    frame.scrollTop = drag.top - (e.clientY - drag.y);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    dragRef.current = null;
  };

  return (
    <div className={cn("group/viewport relative", className)}>
      <div
        ref={frameRef}
        className={cn(
          "overflow-auto overscroll-contain",
          fillHeight ? "h-full" : undefined,
          canPan ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        )}
        style={maxFrameHeight ? { maxHeight: maxFrameHeight } : undefined}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={fit}
      >
        <div className="flex min-h-full min-w-full touch-none select-none items-center justify-center p-2">
          <div ref={hostRef} className="shrink-0" />
        </div>
      </div>

      {!hideControls && (
        <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-0.5 rounded-md border border-border bg-card/90 p-0.5 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover/viewport:pointer-events-auto group-hover/viewport:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
          <SimpleTooltip text="Zoom out">
            <button
              type="button"
              aria-label="Zoom out"
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => zoomBy(1 / ZOOM_STEP)}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          </SimpleTooltip>
          <span className="min-w-[2.75rem] text-center text-[11px] tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <SimpleTooltip text="Zoom in">
            <button
              type="button"
              aria-label="Zoom in"
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => zoomBy(ZOOM_STEP)}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </SimpleTooltip>
          <span className="mx-0.5 h-4 w-px bg-border" />
          <SimpleTooltip text="Fit to view (double-click)">
            <button
              type="button"
              aria-label="Fit to view"
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={fit}
            >
              <Scan className="h-3.5 w-3.5" />
            </button>
          </SimpleTooltip>
          <SimpleTooltip text="Actual size (100%)">
            <button
              type="button"
              aria-label="Actual size"
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={oneToOne}
            >
              <Maximize className="h-3.5 w-3.5" />
            </button>
          </SimpleTooltip>
        </div>
      )}
    </div>
  );
}
