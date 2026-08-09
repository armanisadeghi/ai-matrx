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
 *   - Move/resize: in "select" mode with `onRegionUpdate` wired, the
 *     selected region can be dragged (body) or resized (8 handles); the
 *     final bbox is emitted once, in PDF points, on pointer release.
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
  RegionEditHandle,
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
  /**
   * When provided (and mode is "select"), the SELECTED region grows move +
   * resize affordances: drag the body to move, drag one of the 8 handles to
   * resize. Emits ONCE on pointer-release with the final bbox in PDF
   * user-space points — callers persist via their annotation update path.
   */
  onRegionUpdate?: (regionId: string, bbox: PdfBbox) => void;
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

// Smallest px size a resize can shrink a region to.
const MIN_EDIT_PX = 8;

// ─── Resize handles ─────────────────────────────────────────────────────────
// 10px squares straddling the selected region's corners/edges. Rendered only
// in select mode with `onRegionUpdate` wired, on the selected region.

const RESIZE_HANDLES: Array<{
  id: Exclude<RegionEditHandle, "move">;
  cursor: string;
  style: React.CSSProperties;
}> = [
  { id: "nw", cursor: "nwse-resize", style: { left: -5, top: -5 } },
  { id: "n", cursor: "ns-resize", style: { left: "calc(50% - 5px)", top: -5 } },
  { id: "ne", cursor: "nesw-resize", style: { right: -5, top: -5 } },
  { id: "e", cursor: "ew-resize", style: { right: -5, top: "calc(50% - 5px)" } },
  { id: "se", cursor: "nwse-resize", style: { right: -5, bottom: -5 } },
  { id: "s", cursor: "ns-resize", style: { left: "calc(50% - 5px)", bottom: -5 } },
  { id: "sw", cursor: "nesw-resize", style: { left: -5, bottom: -5 } },
  { id: "w", cursor: "ew-resize", style: { left: -5, top: "calc(50% - 5px)" } },
];

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
  onRegionUpdate,
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
    if (!node) return undefined;
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

  // ── Move/resize state machine (select mode, selected region only) ─────
  type PxRect = { left: number; top: number; width: number; height: number };
  const [edit, setEdit] = useState<{
    regionId: string;
    handle: RegionEditHandle;
    startX: number;
    startY: number;
    orig: PxRect;
    curr: PxRect;
    moved: boolean;
  } | null>(null);

  const editable = mode === "select" && !!onRegionUpdate;

  const beginEdit = useCallback(
    (
      e: React.PointerEvent<HTMLElement>,
      regionId: string,
      handle: RegionEditHandle,
      rect: PxRect,
    ) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const wrapRect = wrapRef.current?.getBoundingClientRect();
      if (!wrapRect) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore — capture can fail on synthetic events.
      }
      setEdit({
        regionId,
        handle,
        startX: e.clientX - wrapRect.left,
        startY: e.clientY - wrapRect.top,
        orig: rect,
        curr: rect,
        moved: false,
      });
    },
    [],
  );

  const applyEditDelta = useCallback(
    (
      handle: RegionEditHandle,
      orig: PxRect,
      dx: number,
      dy: number,
      boundsW: number,
      boundsH: number,
    ): PxRect => {
      if (handle === "move") {
        return {
          left: Math.max(0, Math.min(boundsW - orig.width, orig.left + dx)),
          top: Math.max(0, Math.min(boundsH - orig.height, orig.top + dy)),
          width: orig.width,
          height: orig.height,
        };
      }
      let left = orig.left;
      let top = orig.top;
      let right = orig.left + orig.width;
      let bottom = orig.top + orig.height;
      const movesLeft = handle === "nw" || handle === "w" || handle === "sw";
      const movesRight = handle === "ne" || handle === "e" || handle === "se";
      const movesTop = handle === "nw" || handle === "n" || handle === "ne";
      const movesBottom = handle === "sw" || handle === "s" || handle === "se";
      if (movesLeft) left = Math.max(0, Math.min(right - MIN_EDIT_PX, left + dx));
      if (movesRight) right = Math.min(boundsW, Math.max(left + MIN_EDIT_PX, right + dx));
      if (movesTop) top = Math.max(0, Math.min(bottom - MIN_EDIT_PX, top + dy));
      if (movesBottom) bottom = Math.min(boundsH, Math.max(top + MIN_EDIT_PX, bottom + dy));
      return { left, top, width: right - left, height: bottom - top };
    },
    [],
  );

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
      if (edit) {
        const rect = (wrapRef.current ?? e.currentTarget).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setEdit((prev) => {
          if (!prev) return prev;
          const dx = x - prev.startX;
          const dy = y - prev.startY;
          const moved = prev.moved || Math.abs(dx) > 2 || Math.abs(dy) > 2;
          const curr = applyEditDelta(
            prev.handle,
            prev.orig,
            dx,
            dy,
            rect.width,
            rect.height,
          );
          return { ...prev, curr, moved };
        });
        return;
      }
      if (!pending) return;
      const rect = (wrapRef.current ?? e.currentTarget).getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      setPending((p) => (p ? { ...p, currX: x, currY: y } : p));
    },
    [pending, edit, applyEditDelta],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (edit) {
        const { regionId, curr, moved } = edit;
        setEdit(null);
        if (!moved) return; // plain click — selection handled by onClick.
        const topLeft = pxToPdf(curr.left, curr.top);
        const bottomRight = pxToPdf(
          curr.left + curr.width,
          curr.top + curr.height,
        );
        if (!topLeft || !bottomRight) return;
        onRegionUpdate?.(regionId, {
          x0: Math.min(topLeft.x, bottomRight.x),
          y0: Math.min(topLeft.y, bottomRight.y),
          x1: Math.max(topLeft.x, bottomRight.x),
          y1: Math.max(topLeft.y, bottomRight.y),
        });
        return;
      }
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
        clientX: e.clientX,
        clientY: e.clientY,
      });
    },
    [onDrawComplete, pageNumber, pending, edit, pxToPdf, onRegionUpdate],
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
        const basePx = pdfToPx(region.bbox);
        if (!basePx) return null;
        const isEditing = edit?.regionId === region.id;
        const px = isEditing ? edit.curr : basePx;
        const category = categoryOf?.(region.id);
        const palette = colorsFor({ category, kind: region.kind });
        const stroke = region.color ?? palette.stroke;
        const fill = region.fill ?? palette.fill;
        const isSelected = selectedId === region.id;
        const canEdit = editable && isSelected;
        return (
          <div
            key={region.id}
            data-region-id={region.id}
            role="button"
            tabIndex={0}
            className={cn(
              "absolute rounded-sm",
              isEditing ? "" : "transition-shadow",
              canEdit ? "cursor-move" : "",
              region.muted ? "opacity-50 saturate-50" : "",
            )}
            style={{
              left: px.left,
              top: px.top,
              width: px.width,
              height: px.height,
              border: `2px solid ${stroke}`,
              backgroundColor: fill,
              boxShadow: isSelected ? `0 0 0 2px ${stroke}` : undefined,
            }}
            onPointerDown={
              canEdit
                ? (e) => beginEdit(e, region.id, "move", basePx)
                : undefined
            }
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
            {canEdit
              ? RESIZE_HANDLES.map((h) => (
                  <span
                    key={h.id}
                    data-region-id={region.id}
                    className="absolute z-10 h-2.5 w-2.5 rounded-[2px] border bg-background shadow-sm"
                    style={{
                      ...h.style,
                      borderColor: stroke,
                      cursor: h.cursor,
                    }}
                    onPointerDown={(e) =>
                      beginEdit(e, region.id, h.id, basePx)
                    }
                  />
                ))
              : null}
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
