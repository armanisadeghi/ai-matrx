/**
 * features/files/components/core/PdfAnnotationLayer/PdfAnnotationLayer.tsx
 *
 * The canonical annotation/region overlay primitive. Mounted as an
 * absolutely-positioned layer on top of `PdfDocumentRenderer`'s rendered
 * `<Page>`. Handles:
 *
 *   - Translating PDF user-space points ↔ canvas pixels for the CURRENT
 *     rendered page (auto-tracks zoom + rotation via ResizeObserver on
 *     the page canvas element).
 *   - Rendering existing regions (annotations, candidates, search hits,
 *     selections) as absolutely-positioned divs with kind-aware color.
 *   - Drag-to-select: in "draw" mode, pointer events spawn a pending
 *     rectangle the user can drag. On release, the layer emits a single
 *     `onDrawComplete(bbox)` event with the bbox in PDF user-space points.
 *   - Click-to-select: in "select" / "view" mode, clicking a region emits
 *     `onRegionClick(id)`. Useful for jumping the inspector rail to the
 *     matching row.
 *   - Right-click → emit `onRegionContextMenu(id, x, y)` so callers can
 *     render their own context menu (extract table / send to agent /
 *     exclude / promote to entity / delete / …).
 *
 * Stateless about WHAT a region is — receives `regions: PdfRegion[]` and
 * renders them. The studio / tab / window decides what to mount inside
 * the layer. Same component works in every surface.
 */

"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { colorsFor } from "./colors";
import type {
  AnnotationLayerMode,
  PdfBbox,
  PdfRegion,
  PendingDraw,
} from "./types";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface PdfAnnotationLayerProps {
  /** 1-based current page number being rendered by PdfDocumentRenderer. */
  pageNumber: number;
  /** Natural page dimensions (PDF user-space points). Provided by the renderer. */
  pageWidthPt: number;
  pageHeightPt: number;
  /** Current page rotation override applied by the renderer (0|90|180|270). */
  rotation?: number;
  /** Every region to render. Filtered by page_number — only this page's hits show. */
  regions: PdfRegion[];
  /** Active selection id (for hover/highlight). */
  selectedId?: string | null;
  /** Per-region category lookup for color picking. Optional — falls back to kind/colors. */
  categoryOf?: (regionId: string) => string | undefined;

  mode?: AnnotationLayerMode;
  /** When draw mode: emits the snapped bbox when the user releases the pointer. */
  onDrawComplete?: (draw: PendingDraw) => void;
  onRegionClick?: (regionId: string, event: React.MouseEvent) => void;
  onRegionContextMenu?: (
    regionId: string,
    x: number,
    y: number,
    event: React.MouseEvent,
  ) => void;
  /** When user clicks empty space, lets the caller clear selection. */
  onBackgroundClick?: () => void;
  /** Extra wrapper classes. */
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PdfAnnotationLayer({
  pageNumber,
  pageWidthPt,
  pageHeightPt,
  rotation = 0,
  regions,
  selectedId,
  categoryOf,
  mode = "view",
  onDrawComplete,
  onRegionClick,
  onRegionContextMenu,
  onBackgroundClick,
  className,
}: PdfAnnotationLayerProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Track wrapper px size — drives pt→px scale calc. ResizeObserver gives
  // us live updates when the user changes zoom / rotates.
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setBox((prev) =>
        prev.w === rect.width && prev.h === rect.height
          ? prev
          : { w: rect.width, h: rect.height },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // Scale = px-per-point on the CURRENT axis. Rotation 90/270 swaps which
  // axis maps to which page dimension; we keep things uniform here by
  // treating page dimensions as already-flipped from the renderer side
  // (PdfDocumentRenderer composes rotation after scaling, but the bounding
  // box around the page reflects the post-rotation effective size, so
  // our wrap div has dimensions of rotated page → page_width_pt /
  // page_height_pt should be passed in the rotated orientation too).
  // For 0/180 the wrap is width=page_width_pt*scale, height=page_height_pt*scale.
  // For 90/270 they swap.
  const flipped = rotation === 90 || rotation === 270;
  const effWidthPt = flipped ? pageHeightPt : pageWidthPt;
  const effHeightPt = flipped ? pageWidthPt : pageHeightPt;
  const scaleX = effWidthPt > 0 ? box.w / effWidthPt : 0;
  const scaleY = effHeightPt > 0 ? box.h / effHeightPt : 0;

  // Convert a PDF-points rect → canvas-pixel position relative to wrap.
  const pdfToPx = useCallback(
    (bbox: PdfBbox): { left: number; top: number; width: number; height: number } | null => {
      if (scaleX <= 0 || scaleY <= 0) return null;
      // Rotation: react-pdf rotates the rendered page; we need to map PDF
      // user-space coords (unrotated, top-left origin) to the rotated layout.
      const w = bbox.x1 - bbox.x0;
      const h = bbox.y1 - bbox.y0;
      switch (rotation) {
        case 0: {
          return {
            left: bbox.x0 * scaleX,
            top: bbox.y0 * scaleY,
            width: w * scaleX,
            height: h * scaleY,
          };
        }
        case 90: {
          // After 90° CW rotation: new_x = page_h - y1, new_y = x0
          return {
            left: (pageHeightPt - bbox.y1) * scaleX,
            top: bbox.x0 * scaleY,
            width: h * scaleX,
            height: w * scaleY,
          };
        }
        case 180: {
          return {
            left: (pageWidthPt - bbox.x1) * scaleX,
            top: (pageHeightPt - bbox.y1) * scaleY,
            width: w * scaleX,
            height: h * scaleY,
          };
        }
        case 270: {
          return {
            left: bbox.y0 * scaleX,
            top: (pageWidthPt - bbox.x1) * scaleY,
            width: h * scaleX,
            height: w * scaleY,
          };
        }
        default:
          return null;
      }
    },
    [scaleX, scaleY, rotation, pageWidthPt, pageHeightPt],
  );

  // Inverse — px relative to wrap → PDF user-space points.
  const pxToPdf = useCallback(
    (px: number, py: number): { x: number; y: number } | null => {
      if (scaleX <= 0 || scaleY <= 0) return null;
      switch (rotation) {
        case 0:
          return { x: px / scaleX, y: py / scaleY };
        case 90:
          // new_x = pageHeightPt - y → y = pageHeightPt - new_x
          // new_y = x → x = new_y
          return {
            x: py / scaleY,
            y: pageHeightPt - px / scaleX,
          };
        case 180:
          return {
            x: pageWidthPt - px / scaleX,
            y: pageHeightPt - py / scaleY,
          };
        case 270:
          return {
            x: pageWidthPt - py / scaleY,
            y: px / scaleX,
          };
        default:
          return null;
      }
    },
    [scaleX, scaleY, rotation, pageWidthPt, pageHeightPt],
  );

  // ── Drag-to-select state machine ──────────────────────────────────────
  const [pending, setPending] = useState<{
    startX: number;
    startY: number;
    currX: number;
    currY: number;
  } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (mode !== "draw") return;
      // Only LEFT mouse / primary touch.
      if (e.button !== 0) return;
      // Don't start a draw when the click landed on an existing region —
      // those should fire onRegionClick instead.
      const target = e.target as HTMLElement;
      if (target.dataset.regionId) return;
      const rect = (wrapRef.current ?? e.currentTarget).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      e.currentTarget.setPointerCapture(e.pointerId);
      setPending({ startX: x, startY: y, currX: x, currY: y });
    },
    [mode],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!pending) return;
      const rect = (wrapRef.current ?? e.currentTarget).getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      setPending((p) => (p ? { ...p, currX: x, currY: y } : p));
    },
    [pending],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!pending) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore — pointer may have already been released.
      }
      const { startX, startY, currX, currY } = pending;
      setPending(null);

      const left = Math.min(startX, currX);
      const top = Math.min(startY, currY);
      const right = Math.max(startX, currX);
      const bottom = Math.max(startY, currY);
      // Reject tiny drags (likely a click).
      if (right - left < 4 || bottom - top < 4) return;

      const topLeft = pxToPdf(left, top);
      const bottomRight = pxToPdf(right, bottom);
      if (!topLeft || !bottomRight) return;

      const x0 = Math.min(topLeft.x, bottomRight.x);
      const x1 = Math.max(topLeft.x, bottomRight.x);
      const y0 = Math.min(topLeft.y, bottomRight.y);
      const y1 = Math.max(topLeft.y, bottomRight.y);

      onDrawComplete?.({
        page_number: pageNumber,
        bbox: { x0, y0, x1, y1 },
      });
    },
    [onDrawComplete, pageNumber, pending, pxToPdf],
  );

  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.dataset.regionId) return;
      onBackgroundClick?.();
    },
    [onBackgroundClick],
  );

  // ── Filter regions to the current page ──
  const pageRegions = useMemo(
    () => regions.filter((r) => r.page_number === pageNumber),
    [regions, pageNumber],
  );

  // ── Pending rect (px directly, no PDF round-trip) ──
  const pendingRect = pending
    ? {
        left: Math.min(pending.startX, pending.currX),
        top: Math.min(pending.startY, pending.currY),
        width: Math.abs(pending.currX - pending.startX),
        height: Math.abs(pending.currY - pending.startY),
      }
    : null;

  const cursorClass =
    mode === "draw"
      ? "cursor-crosshair"
      : mode === "select"
        ? "cursor-pointer"
        : "cursor-default";

  return (
    <div
      ref={wrapRef}
      className={cn(
        "absolute inset-0 z-10 select-none",
        cursorClass,
        className,
      )}
      // Capture pointer events when drawing so we don't lose drags that
      // leave the wrapper. View mode: pass through to underlying text layer.
      style={{ pointerEvents: mode === "view" && !onRegionClick && !onBackgroundClick ? "none" : "auto" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleBackgroundClick}
    >
      {pageRegions.map((region) => {
        const px = pdfToPx(region.bbox);
        if (!px) return null;
        const category = categoryOf?.(region.id);
        const palette = colorsFor({ category, kind: region.kind });
        const stroke = region.color ?? palette.stroke;
        const fill = region.fill ?? palette.fill;
        const isSelected = selectedId === region.id;
        return (
          <div
            key={region.id}
            data-region-id={region.id}
            role="button"
            tabIndex={0}
            className={cn(
              "absolute rounded-sm transition-shadow",
              isSelected ? "ring-2 ring-offset-1" : "",
              region.muted ? "opacity-50 saturate-50" : "",
            )}
            style={{
              left: px.left,
              top: px.top,
              width: px.width,
              height: px.height,
              border: `1.5px solid ${stroke}`,
              backgroundColor: fill,
              boxShadow: isSelected ? `0 0 0 2px ${stroke}` : undefined,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onRegionClick?.(region.id, e);
            }}
            onContextMenu={(e) => {
              if (!onRegionContextMenu) return;
              e.preventDefault();
              e.stopPropagation();
              onRegionContextMenu(region.id, e.clientX, e.clientY, e);
            }}
            title={region.label ?? undefined}
          >
            {region.label ? (
              <span
                className="pointer-events-none absolute -top-4 left-0 rounded px-1 py-px text-[10px] font-medium leading-tight text-white shadow"
                style={{ backgroundColor: stroke }}
              >
                {region.label}
              </span>
            ) : null}
          </div>
        );
      })}

      {pendingRect ? (
        <div
          className="pointer-events-none absolute rounded-sm border-2 border-dashed border-sky-500 bg-sky-500/15"
          style={pendingRect}
        />
      ) : null}
    </div>
  );
}
