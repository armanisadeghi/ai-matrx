"use client";

/**
 * QuadEditor — draggable 4-corner crop overlay for document scans.
 *
 * Renders the image with an SVG overlay: a translucent mask outside the
 * quad, the quad outline, and four touch-friendly corner handles. All
 * coordinates in/out are **natural image pixels** (post-EXIF-transpose —
 * what the browser displays and what the server crops with); the editor
 * converts to rendered pixels internally.
 */

import React, { useCallback, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import type { Quad, QuadPoint } from "../types";

const CORNERS = [
  "top_left",
  "top_right",
  "bottom_right",
  "bottom_left",
] as const;
type CornerName = (typeof CORNERS)[number];

interface QuadEditorProps {
  imageUrl: string;
  /** Natural (full-resolution) image dimensions. */
  naturalWidth: number;
  naturalHeight: number;
  /** Current quad in natural pixels. */
  quad: Quad;
  onChange: (quad: Quad) => void;
  className?: string;
}

export function QuadEditor({
  imageUrl,
  naturalWidth,
  naturalHeight,
  quad,
  onChange,
  className,
}: QuadEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<CornerName | null>(null);

  const startDrag = useCallback(
    (corner: CornerName) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(corner);
      // Only the dragged corner moves during a gesture — capture the
      // start quad once and derive every update from it, so no ref
      // mirroring of the live prop is needed.
      const startQuad = quad;

      const toNatural = (ev: PointerEvent): QuadPoint => {
        const el = containerRef.current;
        if (!el) return startQuad[corner];
        const rect = el.getBoundingClientRect();
        const x = ((ev.clientX - rect.left) / rect.width) * naturalWidth;
        const y = ((ev.clientY - rect.top) / rect.height) * naturalHeight;
        return [
          Math.min(Math.max(x, 0), naturalWidth),
          Math.min(Math.max(y, 0), naturalHeight),
        ];
      };

      const move = (ev: PointerEvent) => {
        onChange({ ...startQuad, [corner]: toNatural(ev) });
      };
      const up = () => {
        setDragging(null);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [quad, naturalWidth, naturalHeight, onChange],
  );

  const points = CORNERS.map((c) => quad[c]);
  const polygon = points.map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full select-none", className)}
      style={{ aspectRatio: `${naturalWidth} / ${naturalHeight}` }}
    >
      <img
        src={imageUrl}
        alt="Crop preview"
        className="absolute inset-0 h-full w-full object-fill"
        draggable={false}
      />
      <svg
        className="absolute inset-0 h-full w-full touch-none"
        viewBox={`0 0 ${naturalWidth} ${naturalHeight}`}
        preserveAspectRatio="none"
      >
        {/* Dim everything outside the quad. */}
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
      {/* Handles live in CSS space (percentages) for crisp hit targets. */}
      {CORNERS.map((corner) => {
        const [x, y] = quad[corner];
        return (
          <button
            key={corner}
            type="button"
            aria-label={`Drag ${corner.replace("_", " ")} corner`}
            onPointerDown={startDrag(corner)}
            className={cn(
              "absolute z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full",
              dragging === corner && "scale-110",
            )}
            style={{
              left: `${(x / naturalWidth) * 100}%`,
              top: `${(y / naturalHeight) * 100}%`,
            }}
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
