/**
 * features/file-analysis/components/AnnotatablePdfCanvas.tsx
 *
 * The reusable canvas: PdfPreview + PdfAnnotationLayer + draw-to-create
 * flow. Renders identically in a side-sheet tab, a floating window, or
 * the full-screen studio — the wrapper controls the chrome (toolbars,
 * panels, etc.).
 *
 * Responsibilities:
 *   1. Mount PdfPreview with a renderOverlay that hands geometry to
 *      PdfAnnotationLayer.
 *   2. Convert auto-detected candidates / annotations / search hits
 *      into PdfRegion[].
 *   3. On draw complete:
 *        - POST /annotations/snap-bbox       → tighten
 *        - POST /annotations/extract-at-bbox → preview + text
 *      ...both in parallel, then open <LabelPicker/>.
 *   4. On label picker confirm → POST /annotations.
 *
 * Doesn't decide what to show — the parent passes `regions` + `mode`.
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { PdfAnnotationLayer } from "@/features/files";
import type {
  AnnotationLayerMode,
  PdfRegion,
  PendingDraw,
} from "@/features/files";
import { LabelPicker } from "./LabelPicker";
import { useLabelCatalog } from "@/features/file-analysis/hooks/useLabelCatalog";
import * as Api from "@/features/file-analysis/api/file-analysis";
import type {
  AnnotationCreateBody,
  AnnotationOut,
} from "@/features/file-analysis/api/file-analysis";

// Lazy-load PdfPreview so the canvas itself doesn't pay the react-pdf cost
// until it's mounted.
const PdfPreview = dynamic(
  () =>
    import(
      "@/features/files/components/core/FilePreview/previewers/PdfPreview"
    ),
  { ssr: false, loading: () => <CanvasSkeleton /> },
);

function CanvasSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted/20 text-xs text-muted-foreground">
      Loading PDF…
    </div>
  );
}

export interface AnnotatablePdfCanvasProps {
  fileId: string;
  /** Controlled current page (1-based). */
  pageNumber: number;
  onPageChange?: (page: number) => void;

  /** Regions to render on top of the page. */
  regions: PdfRegion[];
  /** Active selection id (highlighted). */
  selectedId?: string | null;
  /** Per-region category lookup so the overlay picks the right color. */
  categoryOf?: (regionId: string) => string | undefined;

  /** Layer mode — drives cursor + drag-to-select behavior. */
  mode?: AnnotationLayerMode;

  /**
   * REQUIRED — async create function that BOTH persists the annotation AND
   * updates the shared cache. The canvas calls this instead of the raw API
   * so the new annotation appears on the page instantly (cache mutate) and
   * in every panel that reads useAnnotations (annotations panel, redact
   * panel, findings, etc.) without waiting for Realtime to round-trip.
   *
   * Pass `useAnnotations(fileId).create` from the parent.
   */
  createAnnotation: (body: AnnotationCreateBody) => Promise<AnnotationOut>;

  /** Called AFTER the create succeeds (e.g. to select the new annotation). */
  onAnnotationCreated?: (annotation: AnnotationOut) => void;

  /** Click handlers forwarded to the layer. */
  onRegionClick?: (regionId: string) => void;
  onRegionContextMenu?: (
    regionId: string,
    x: number,
    y: number,
  ) => void;
  onBackgroundClick?: () => void;

  className?: string;
}

export function AnnotatablePdfCanvas({
  fileId,
  pageNumber,
  onPageChange,
  regions,
  selectedId,
  categoryOf,
  mode = "view",
  createAnnotation,
  onAnnotationCreated,
  onRegionClick,
  onRegionContextMenu,
  onBackgroundClick,
  className,
}: AnnotatablePdfCanvasProps) {
  const labelCatalog = useLabelCatalog();

  // Pending-draft state — owned at this level so the popover can render.
  const [draft, setDraft] = useState<{
    page_number: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    snappedBbox?: { x0: number; y0: number; x1: number; y1: number };
    extractedText: string;
    extractedTextSource: string;
    previewPng?: string | null;
    anchor: { x: number; y: number };
    loading: boolean;
  } | null>(null);

  const handleDrawComplete = useCallback(
    async (draw: PendingDraw) => {
      if (mode !== "draw") return;
      // Open the picker at the bottom-right of the drag so it doesn't cover
      // the freshly-drawn rect. The user can move it; we just need an anchor.
      const anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      setDraft({
        page_number: draw.page_number,
        bbox: draw.bbox,
        extractedText: "",
        extractedTextSource: "none",
        anchor,
        loading: true,
      });

      // Snap + extract in parallel.
      const [snapResult, extractResult] = await Promise.allSettled([
        Api.snapBbox(fileId, {
          page_number: draw.page_number,
          bbox: draw.bbox,
          expand_pad_pt: 1.5,
        }),
        Api.extractAtBbox(fileId, {
          page_number: draw.page_number,
          bbox: draw.bbox,
          include_preview: true,
        }),
      ]);

      let snappedBbox = draw.bbox;
      if (snapResult.status === "fulfilled") {
        snappedBbox = snapResult.value.data.snapped_bbox;
      }
      let extractedText = "";
      let extractedTextSource = "none";
      let previewPng: string | null = null;
      if (extractResult.status === "fulfilled") {
        extractedText = extractResult.value.data.extracted_text ?? "";
        extractedTextSource = extractResult.value.data.text_source ?? "none";
        previewPng = extractResult.value.data.preview_png_base64 ?? null;
      }

      setDraft((prev) =>
        prev
          ? {
              ...prev,
              snappedBbox,
              extractedText,
              extractedTextSource,
              previewPng,
              loading: false,
            }
          : prev,
      );
    },
    [fileId, mode],
  );

  const handleConfirm = useCallback(
    async (
      body: Omit<AnnotationCreateBody, "page_number" | "bbox">,
    ) => {
      if (!draft) return;
      const bbox = draft.snappedBbox ?? draft.bbox;
      try {
        // Routes through useAnnotations.create → updates shared cache via
        // mutate() the moment the server returns. Every consumer (canvas
        // regions, annotations panel, redact panel, findings) sees the new
        // row instantly. No more "blink and it's gone" wait for Realtime.
        const data = await createAnnotation({
          ...body,
          page_number: draft.page_number,
          bbox,
        });
        onAnnotationCreated?.(data);
      } catch (err) {
        // Keep the picker open so the user can retry. Log so we can see
        // server-side validation failures in the console.
        console.error("[annotation.create] failed", err);
        return;
      } finally {
        setDraft(null);
      }
    },
    [draft, createAnnotation, onAnnotationCreated],
  );

  const handleCancel = useCallback(() => setDraft(null), []);

  // Pending-draft visual: render the snapped bbox once we get it back.
  const visibleRegions = useMemo(() => {
    if (!draft) return regions;
    const draftBbox = draft.snappedBbox ?? draft.bbox;
    return [
      ...regions,
      {
        id: "__draft__",
        page_number: draft.page_number,
        bbox: draftBbox,
        kind: "selection" as const,
      },
    ];
  }, [regions, draft]);

  const renderOverlay = useCallback(
    (info: {
      pageNumber: number;
      pageWidthPt: number;
      pageHeightPt: number;
      rotation: number;
    }) => (
      <PdfAnnotationLayer
        pageNumber={info.pageNumber}
        pageWidthPt={info.pageWidthPt}
        pageHeightPt={info.pageHeightPt}
        rotation={info.rotation}
        regions={visibleRegions}
        selectedId={selectedId}
        categoryOf={categoryOf}
        mode={mode}
        onDrawComplete={handleDrawComplete}
        onRegionClick={(id) => onRegionClick?.(id)}
        onRegionContextMenu={(id, x, y) => onRegionContextMenu?.(id, x, y)}
        onBackgroundClick={onBackgroundClick}
      />
    ),
    [
      visibleRegions,
      selectedId,
      categoryOf,
      mode,
      handleDrawComplete,
      onRegionClick,
      onRegionContextMenu,
      onBackgroundClick,
    ],
  );

  return (
    <div className={cn("relative h-full w-full", className)}>
      <PdfPreview
        fileId={fileId}
        pageNumber={pageNumber}
        onPageChange={onPageChange}
        renderOverlay={renderOverlay}
      />
      <LabelPicker
        open={!!draft}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
        anchor={draft?.anchor ?? null}
        labels={labelCatalog.labels}
        byCategory={labelCatalog.byCategory}
        categories={labelCatalog.categories}
        previewPng={draft?.previewPng ?? null}
        extractedText={draft?.extractedText ?? ""}
        extractedTextSource={draft?.extractedTextSource}
        loading={!!draft?.loading}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
}
