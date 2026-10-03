"use client";

/**
 * Bounded, fit-aware pan/zoom viewport for a rendered mermaid SVG.
 *
 * The sizing problem this solves: a diagram has its own intrinsic aspect ratio,
 * and naively fitting it to the container width either runs off the screen
 * vertically (tall flowcharts) or shrinks the text to nothing (wide mind maps).
 *
 * The fix is THE DIAGRAM'S FIT RULE (`canvas-adaptive.ts`, one floor for both):
 *  - Fit the WHOLE drawing when that scale keeps text readable
 *    (≥ `DIAGRAM_READABLE_ZOOM`, 14px text at ≥ 10px) — a 1648px flowchart in
 *    a 1370px pane fits whole at ~0.83 instead of overflowing sideways.
 *  - Otherwise fit the WIDTH, never below that floor; the view starts at the
 *    top-left and the rest is reached by scrolling / panning.
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

import { DIAGRAM_READABLE_ZOOM } from "@/components/mardown-display/blocks/canvas-adaptive";
import { SimpleTooltip } from "@/components/matrx/Tooltip";
import { cn } from "@/lib/utils";

/** Don't auto-upscale past natural size on fit. */
const MAX_FIT = 1;
/** Manual zoom bounds (the user may go past the auto limits deliberately). */
const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.25;
/** Breathing room inside the frame so the diagram never touches the edges. */
const FRAME_PADDING = 16;

interface FrameBox {
  w: number;
  h: number;
}

/**
 * Whether a frame resize re-fits the diagram. The pane growing (Expand,
 * unsplit) or shrinking re-fits unless the person zoomed or panned by hand
 * since the last fit — their view is theirs. A frame whose height follows its
 * content (not `fillHeight`) re-fits on WIDTH only: fitting changes the
 * content height, which would change the frame height and oscillate.
 */
export function shouldRefitOnResize(input: {
  previous: FrameBox | null;
  next: FrameBox;
  fillHeight: boolean;
  userAdjusted: boolean;
  fitPending: boolean;
}): boolean {
  const { previous, next, fillHeight, userAdjusted, fitPending } = input;
  if (userAdjusted) return false;
  if (fitPending || !previous) return true;
  if (next.w !== previous.w) return true;
  return fillHeight && next.h !== previous.h;
}

interface NaturalSize {
  w: number;
  h: number;
}

export interface MermaidFit {
  scale: number;
  /** The whole drawing fits; false = width fit at the floor, view at top-left. */
  whole: boolean;
}

/**
 * THE diagram fit rule (same floor as `portraitWidthFitViewport`): fit the
 * whole drawing when that scale is readable, else fit the width down to the
 * readable floor. `fh` is `Infinity` for a frame with no height bound.
 */
export function mermaidFitScale(
  nat: NaturalSize,
  fw: number,
  fh: number,
): MermaidFit {
  if (!nat.w || !nat.h || !(fw > 0) || !(fh > 0)) return { scale: 1, whole: true };
  const whole = Math.min(MAX_FIT, fw / nat.w, fh / nat.h);
  if (whole >= DIAGRAM_READABLE_ZOOM) return { scale: whole, whole: true };
  return {
    scale: Math.min(MAX_FIT, Math.max(DIAGRAM_READABLE_ZOOM, fw / nat.w)),
    whole: false,
  };
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
  /**
   * The frame's inner size as the ResizeObserver last reported it — read after
   * the browser's own layout, never forced. Null until the first report.
   */
  const frameBoxRef = useRef<{ w: number; h: number } | null>(null);
  /** New content arrived before the first size report: fit on that report. */
  const fitPendingRef = useRef(false);

  const [scale, setScale] = useState(1);
  const [canPan, setCanPan] = useState(false);

  const dragRef = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);

  /** Frame inner dimensions available for fitting (cap takes priority). */
  // 🚨 Never read clientWidth/clientHeight here: this runs right after a new
  // diagram's markup went into the page, so the read forces a layout of the
  // WHOLE document — on a 1 MB page, 20–1,800 ms per diagram (2026-09-26). The
  // ResizeObserver below reports the size after the browser's own layout.
  const frameSize = useCallback((): { fw: number; fh: number } => {
    const box = frameBoxRef.current ?? { w: 0, h: 0 };
    const fw = box.w - FRAME_PADDING;
    // A frame whose height follows its content has no height to fit to.
    const bound = maxFrameHeight ?? (fillHeight ? box.h : Infinity);
    return { fw: Math.max(0, fw), fh: Math.max(0, bound - FRAME_PADDING) };
  }, [maxFrameHeight, fillHeight]);

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
    const { scale: s, whole } = mermaidFitScale(nat, fw, fh);
    userAdjustedRef.current = false;
    // Size the element now: a NEW drawing (the pane flipped a flowchart's
    // direction on Expand) fitted to the same scale as the old one leaves
    // `scale` unchanged, so the effect below never runs and the new SVG kept
    // the browser's default 300x150 box — small in the middle of the pane.
    applyScale(s);
    setScale(s);
    // Wider (or taller) than the pane at the readable floor: start at the
    // top-left, the rest is reached by scrolling / panning.
    const frame = frameRef.current;
    if (!whole && frame) {
      frame.scrollLeft = 0;
      frame.scrollTop = 0;
    }
  }, [frameSize, applyScale]);

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
    if (!host) return undefined;
    host.innerHTML = svg;
    const el = host.querySelector("svg") as SVGSVGElement | null;
    svgRef.current = el;

    if (el) {
      el.style.display = "block";
      // Intrinsic size from the viewBox (mermaid always emits one); fall back
      // to the bounding box if a future grammar omits it.
      const vb = el.viewBox?.baseVal;
      let nat: NaturalSize | null =
        vb && vb.width && vb.height ? { w: vb.width, h: vb.height } : null;
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
    // 🚨 The fit needs the frame size, and READING it here forces a layout of
    // the whole document: synchronously, every diagram in one commit forced its
    // own (13-22 s on a 1 MB document, 2026-09-26); in a frame callback, each
    // diagram drawn later in idle time still forced one (20–1,800 ms each).
    // The ResizeObserver below reports the size after the browser's own
    // layout, so fitting reads nothing: with a known size fit now; before the
    // first report, fit on that report.
    if (userAdjustedRef.current) applyScaleRef.current(scaleRef.current);
    else if (frameBoxRef.current) fitRef.current();
    else fitPendingRef.current = true;

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
    if (!frame || !host || typeof ResizeObserver === "undefined")
      return undefined;
    const ro = new ResizeObserver(() => {
      setCanPan(
        frame.scrollWidth > frame.clientWidth + 1 ||
          frame.scrollHeight > frame.clientHeight + 1,
      );
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  // Re-fit when the pane resizes (Expand / Restore, split / unsplit, window
  // resize) unless the person has zoomed or panned since the last fit. A
  // content-height frame re-fits on width only — see `shouldRefitOnResize`.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => {
      // Inside the observer callback layout is already clean — these reads
      // cost nothing.
      const next = { w: frame.clientWidth, h: frame.clientHeight };
      const previous = frameBoxRef.current;
      frameBoxRef.current = next;
      const refit = shouldRefitOnResize({
        previous,
        next,
        fillHeight: Boolean(fillHeight),
        userAdjusted: userAdjustedRef.current,
        fitPending: fitPendingRef.current,
      });
      fitPendingRef.current = false;
      if (refit) fit();
    });
    ro.observe(frame);
    return () => ro.disconnect();
  }, [fit, fillHeight]);

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
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      left: frame.scrollLeft,
      top: frame.scrollTop,
    };
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
    // A drag that actually moved the view is a manual pan: the next pane
    // resize keeps this view instead of re-fitting.
    if (frame.scrollLeft !== drag.left || frame.scrollTop !== drag.top) {
      userAdjustedRef.current = true;
    }
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
          // 🚨 The page scrolls over a diagram. `overscroll-contain` plus a
          // vertical scroller here swallowed the mouse wheel wherever a
          // diagram rendered (verifier round 2). Vertically the diagram is
          // fitted, so it needs no wheel scroll: a zoomed diagram pans by drag
          // (which sets scrollTop directly) and zooms with ctrl/cmd-wheel.
          // Only a full-height viewer (full screen) owns vertical scrolling.
          fillHeight ? "h-full overflow-auto" : "overflow-x-auto overflow-y-hidden",
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
        {/* `-safe` centering: a drawing larger than the frame starts at its
            top-left edge instead of overflowing past an unscrollable left/top. */}
        <div className="flex min-h-full min-w-full touch-none select-none items-center-safe justify-center-safe p-2">
          <div ref={hostRef} className="shrink-0" />
        </div>
      </div>

      {!hideControls && (
        <div className="pointer-events-auto absolute bottom-2 right-2 z-10 flex items-center gap-0.5 rounded-md border border-border bg-card/90 p-0.5 opacity-100 shadow-sm backdrop-blur-sm transition-opacity sm:opacity-70 sm:group-hover/viewport:opacity-100 focus-within:opacity-100">
          <SimpleTooltip text="Zoom out">
            <button
              type="button"
              aria-label="Zoom out"
              className="flex h-11 w-11 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground sm:h-auto sm:w-auto sm:p-1.5"
              onClick={() => zoomBy(1 / ZOOM_STEP)}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          </SimpleTooltip>
          <span className="flex h-11 min-w-11 items-center justify-center text-center text-[11px] tabular-nums text-muted-foreground sm:h-auto">
            {Math.round(scale * 100)}%
          </span>
          <SimpleTooltip text="Zoom in">
            <button
              type="button"
              aria-label="Zoom in"
              className="flex h-11 w-11 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground sm:h-auto sm:w-auto sm:p-1.5"
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
              className="flex h-11 w-11 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground sm:h-auto sm:w-auto sm:p-1.5"
              onClick={fit}
            >
              <Scan className="h-3.5 w-3.5" />
            </button>
          </SimpleTooltip>
          <SimpleTooltip text="Actual size (100%)">
            <button
              type="button"
              aria-label="Actual size"
              className="flex h-11 w-11 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground sm:h-auto sm:w-auto sm:p-1.5"
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
