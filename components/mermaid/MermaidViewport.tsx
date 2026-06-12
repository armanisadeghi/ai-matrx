"use client";

/**
 * Pan/zoom viewport for a rendered mermaid SVG.
 *
 * Pointer-based, no dependencies: ctrl/cmd-wheel (and trackpad pinch) zooms,
 * drag pans, two-finger touch pinches, double-click resets. Plain wheel
 * scrolls the page as normal — an embedded diagram must never hijack scroll.
 */

import React, { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Scan } from "lucide-react";

import { cn } from "@/lib/utils";

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.25;

interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

const IDENTITY: Transform = { scale: 1, tx: 0, ty: 0 };

interface MermaidViewportProps {
  /** Rendered SVG markup (sanitized by mermaid under securityLevel strict). */
  svg: string;
  className?: string;
  /** Hide the zoom controls (e.g. tiny inline contexts). */
  hideControls?: boolean;
  /** Receives the live SVG element after each injection (visual-mode hook). */
  onSvgMounted?: (el: SVGSVGElement | null) => void;
}

export function MermaidViewport({ svg, className, hideControls, onSvgMounted }: MermaidViewportProps) {
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);

  // Injection is an effect (not a ref callback) so it re-runs when `svg`
  // changes — progressive streaming re-renders swap the markup in place.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    el.innerHTML = svg;
    const svgEl = el.querySelector("svg");
    if (svgEl) {
      // Let the SVG size to its container; mermaid sets max-width inline.
      svgEl.style.maxWidth = "100%";
      svgEl.style.height = "auto";
      svgEl.style.display = "block";
    }
    onSvgMounted?.(svgEl as SVGSVGElement | null);
    return () => {
      onSvgMounted?.(null);
    };
  }, [svg, onSvgMounted]);

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const zoomBy = (factor: number) =>
    setTransform((t) => ({ ...t, scale: clampScale(t.scale * factor) }));

  const reset = () => setTransform(IDENTITY);

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return; // plain wheel = page scroll
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: transform.scale };
      dragRef.current = null;
      return;
    }
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, tx: transform.tx, ty: transform.ty };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinchRef.current && pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const ratio = distance / pinchRef.current.distance;
      setTransform((t) => ({ ...t, scale: clampScale(pinchRef.current!.scale * ratio) }));
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    setTransform((t) => ({
      ...t,
      tx: drag.tx + (e.clientX - drag.x),
      ty: drag.ty + (e.clientY - drag.y),
    }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    dragRef.current = null;
  };

  const zoomed = transform.scale !== 1 || transform.tx !== 0 || transform.ty !== 0;

  return (
    <div className={cn("group/viewport relative overflow-hidden", className)}>
      <div
        className={cn("touch-none select-none", zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-default")}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={reset}
      >
        <div
          ref={hostRef}
          className="flex justify-center py-2 [transform-origin:center_top]"
          style={{
            transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
          }}
        />
      </div>
      {!hideControls && (
        <div className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-md border border-border bg-card/90 p-0.5 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover/viewport:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            aria-label="Zoom out"
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => zoomBy(1 / ZOOM_STEP)}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Reset zoom"
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={reset}
          >
            <Scan className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => zoomBy(ZOOM_STEP)}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
