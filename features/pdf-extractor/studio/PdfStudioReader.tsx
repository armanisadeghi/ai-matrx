"use client";

/**
 * PdfStudioReader — three synced reading panes.
 *
 *   ┌──────────────────┬──────────────────┬──────────────────┐
 *   │ Source PDF       │ Raw extraction   │ AI-cleaned       │
 *   │ (iframe + #page) │ per-page anchors │ per-page anchors │
 *   │                  │ + section chips  │ + section chips  │
 *   └──────────────────┴──────────────────┴──────────────────┘
 *
 * The caller passes:
 *   - `pages` (per-page rows from `processed_document_pages`).
 *   - `activePage` — currently most-visible page number.
 *   - `onActivePage(n)` — emitted when scrolling drives a new active page.
 *   - `pendingScrollPage` — when set, all panes scroll to that page once
 *     and clear the pending state via `onScrollHandled`.
 *
 * Scroll sync is one-directional from whichever text pane the user is
 * actively scrolling (the most-visible page-anchor wins). The PDF iframe
 * follows via `#page=N`. The other text pane follows by `scrollIntoView`
 * on the matching anchor — without re-emitting the page, so we don't
 * fight ourselves.
 *
 * Density / pane visibility is owned by the caller so power users can
 * collapse a pane via keyboard.
 */

import React, {
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useState,
} from "react";
import dynamic from "next/dynamic";
import {
  FileText,
  MousePointerClick,
  Loader2,
  Eye,
  EyeOff,
  AlertTriangle,
  Wand2,
  Upload,
  Crop,
  Download,
  GripVertical,
  Save,
  Pencil,
  X,
  Check,
  RefreshCw,
  SquareStack,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePdfDemoApi } from "@/features/pdf-demo/hooks/usePdfDemoApi";
import type { BinaryResult } from "@/features/pdf-demo/hooks/usePdfDemoApi";
import { parsePagesInput } from "@/features/pdf-demo/utils/pages";
import { uploadFile } from "@/features/files/api/files";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

// react-pdf + pdfjs-dist is ~400KB; defer both viewers until they mount.
const PdfStudioUrlViewer = dynamic(() => import("./PdfStudioUrlViewer"), {
  ssr: false,
  loading: () => <PdfPaneLoading />,
});

// Shared renderer used by PdfCldFileViewer below.
const PdfDocumentRenderer = dynamic(
  () =>
    import("@/features/files/components/core/FilePreview/previewers/PdfDocumentRenderer"),
  { ssr: false, loading: () => <PdfPaneLoading /> },
);

function PdfPaneLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="w-5 h-5 text-muted-foreground/60 animate-spin" />
    </div>
  );
}

/**
 * Viewer for docs whose source is a `cld_files` row.
 *
 * `processed_documents.storage_uri` is stored as an `s3://` protocol URI
 * that the Python backend uses internally — it can't be fetched from a
 * browser directly. When `source_kind = 'cld_file'` the correct path is
 * to proxy through the Python `/files/{id}/download` endpoint, which is
 * exactly what `useFileBlob` does.
 */
function PdfCldFileViewer({
  fileId,
  fileName,
  pageNumber,
  onPageChange,
}: {
  fileId: string;
  fileName?: string | null;
  pageNumber?: number;
  onPageChange?: (page: number) => void;
}) {
  const { url, loading, error, bytesLoaded, bytesTotal } = useFileBlob(fileId);
  return (
    <PdfDocumentRenderer
      blobUrl={url}
      fileName={fileName ?? null}
      loading={loading}
      bytesLoaded={bytesLoaded}
      bytesTotal={bytesTotal}
      error={error}
      pageNumber={pageNumber}
      onPageChange={onPageChange}
      className="border-0"
    />
  );
}
import { cn } from "@/lib/utils";
import { useFileBlob } from "@/features/files/hooks/useFileBlob";
import type { PdfDocument } from "../hooks/usePdfExtractor";
import type { PdfPageRow } from "../hooks/useProcessedDocumentPages";
import { ExtractionsPane } from "@/features/page-extraction/components/ExtractionsPane";

export type PaneKey = "pdf" | "raw" | "clean" | "extractions";
export type PdfPaneEditMode = "crop" | "reorder" | null;

export interface PdfStudioReaderProps {
  doc: PdfDocument;
  pages: PdfPageRow[];
  loading: boolean;
  error: string | null;
  activePage: number | null;
  onActivePage: (page: number | null) => void;
  pendingScrollPage: number | null;
  onScrollHandled: () => void;
  visiblePanes: Set<PaneKey>;
  onTogglePane: (pane: PaneKey) => void;
  /** Active find query — every match in the visible text panes is highlighted. */
  findQuery: string;
  /** Called when the user wants to re-run the full pipeline on this doc. */
  onRunPipeline: () => void | Promise<unknown>;
  pipelineRunning: boolean;
  /** Called when the user wants to open the upload drawer (e.g. to refresh a missing source). */
  onOpenUpload: () => void;
  /** Visual edit mode — 'crop' overlays a selection rect, 'reorder' shows a page-tile grid. */
  editMode: PdfPaneEditMode;
  /** Pages string passed from ManipulationPanel when starting a crop (e.g. "1,3-5"). */
  cropPagesInput: string;
  /** Called when the user cancels the visual edit tool. */
  onEditModeCancel: () => void;
  /** Refresh the per-page rows from the DB (e.g. after re-cleaning). */
  onRefreshPages: () => void;
  /** Jump all synced panes to this page (used by the extractions pane). */
  onJumpToPage?: (page: number) => void;
}

export function PdfStudioReader({
  doc,
  pages,
  loading,
  error,
  activePage,
  onActivePage,
  pendingScrollPage,
  onScrollHandled,
  visiblePanes,
  onTogglePane,
  findQuery,
  onRunPipeline,
  pipelineRunning,
  onOpenUpload,
  editMode,
  cropPagesInput,
  onEditModeCancel,
  onRefreshPages,
  onJumpToPage,
}: PdfStudioReaderProps) {
  const hasPages = pages.length > 0;
  // True when per-page rows exist but every row's text is empty — typically
  // because an older pipeline run created page stubs without persisting the
  // extracted text. We fall back to the aggregate `content` / `clean_content`
  // and surface a re-run CTA.
  const allPagesEmpty = useMemo(
    () =>
      pages.length > 0 &&
      pages.every((p) => !p.rawText.trim() && !p.cleanedText.trim()),
    [pages],
  );

  // Each text pane registers its own scroll container. Whichever one the
  // user touched most recently is allowed to drive sync — the other
  // follows via `scrollIntoView`. `lastScrolledPaneRef` is a non-state
  // ref because we don't want to re-render to track focus.
  const lastScrolledPaneRef = useRef<PaneKey | null>(null);

  // The PDF viewer (PdfPreview) is driven via its `pageNumber` prop —
  // see `PdfPane` below. No iframe ref needed.

  if (loading && !hasPages) {
    return <ReaderSkeleton visiblePanes={visiblePanes} />;
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!hasPages) {
    return <LegacyReaderFallback doc={doc} />;
  }

  return (
    <div className="flex flex-1 min-h-0">
      {visiblePanes.has("pdf") && (
        <PdfPane
          doc={doc}
          activePage={activePage}
          onActivePage={onActivePage}
          onTogglePane={() => onTogglePane("pdf")}
          onOpenUpload={onOpenUpload}
          editMode={editMode}
          cropPagesInput={cropPagesInput}
          onEditModeCancel={onEditModeCancel}
        />
      )}
      {visiblePanes.has("raw") && (
        <TextPane
          paneKey="raw"
          title="Raw extraction"
          subtitle="System A · per-page"
          icon={<FileText className="w-3 h-3 text-muted-foreground" />}
          doc={doc}
          pages={pages}
          field="raw"
          activePage={activePage}
          onActivePage={onActivePage}
          pendingScrollPage={pendingScrollPage}
          onScrollHandled={onScrollHandled}
          lastScrolledPaneRef={lastScrolledPaneRef}
          findQuery={findQuery}
          onTogglePane={() => onTogglePane("raw")}
          allPagesEmpty={allPagesEmpty}
          onRunPipeline={onRunPipeline}
          pipelineRunning={pipelineRunning}
          onRefreshPages={onRefreshPages}
        />
      )}
      {visiblePanes.has("clean") && (
        <TextPane
          paneKey="clean"
          title="AI-cleaned"
          subtitle="System B · per-page"
          icon={<MousePointerClick className="w-3 h-3 text-primary" />}
          doc={doc}
          pages={pages}
          field="cleaned"
          activePage={activePage}
          onActivePage={onActivePage}
          pendingScrollPage={pendingScrollPage}
          onScrollHandled={onScrollHandled}
          lastScrolledPaneRef={lastScrolledPaneRef}
          findQuery={findQuery}
          onTogglePane={() => onTogglePane("clean")}
          highlightSection
          allPagesEmpty={allPagesEmpty}
          onRunPipeline={onRunPipeline}
          pipelineRunning={pipelineRunning}
          onRefreshPages={onRefreshPages}
        />
      )}
      {visiblePanes.has("extractions") && (
        <section className="flex-1 min-w-0 flex flex-col border-r last:border-r-0 border-border">
          <div className="shrink-0 px-2.5 py-1.5 border-b border-border flex items-center gap-1.5">
            <SquareStack className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/80">
              Extractions
            </span>
            <span className="text-[10px] text-muted-foreground">
              · per-page results
            </span>
            <button
              type="button"
              onClick={() => onTogglePane("extractions")}
              className="ml-auto p-0.5 text-muted-foreground/60 hover:text-foreground rounded transition-colors"
              title="Hide pane"
            >
              <EyeOff className="w-3 h-3" />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <ExtractionsPane
              fileId={
                doc.sourceKind === "cld_file" && doc.sourceId
                  ? doc.sourceId
                  : null
              }
              processedDocumentId={doc.id}
              activePage={activePage}
              onJumpToPage={onJumpToPage}
            />
          </div>
        </section>
      )}
    </div>
  );
}

// ── PDF pane ──────────────────────────────────────────────────────────────

function PdfPane({
  doc,
  activePage,
  onActivePage,
  onTogglePane,
  onOpenUpload,
  editMode,
  cropPagesInput,
  onEditModeCancel,
}: {
  doc: PdfDocument;
  activePage: number | null;
  onActivePage: (page: number | null) => void;
  onTogglePane: () => void;
  onOpenUpload: () => void;
  editMode: PdfPaneEditMode;
  cropPagesInput: string;
  onEditModeCancel: () => void;
}) {
  const onViewerPageChange = useCallback(
    (page: number) => onActivePage(page),
    [onActivePage],
  );

  const pdfViewer =
    doc.sourceKind === "cld_file" && doc.sourceId ? (
      <PdfCldFileViewer
        fileId={doc.sourceId}
        fileName={doc.name}
        pageNumber={activePage ?? 1}
        onPageChange={onViewerPageChange}
      />
    ) : doc.source && !doc.source.startsWith("s3://") ? (
      <PdfStudioUrlViewer
        url={doc.source}
        fileName={doc.name}
        pageNumber={activePage ?? 1}
        onPageChange={onViewerPageChange}
        className="border-0"
      />
    ) : (
      <PdfPaneEmptyState doc={doc} onOpenUpload={onOpenUpload} />
    );

  return (
    <section className="flex-1 min-w-0 flex flex-col border-r border-border bg-muted/10">
      <PaneHeader
        title={
          editMode === "crop"
            ? "Crop — draw selection"
            : editMode === "reorder"
              ? "Reorder pages"
              : "Source PDF"
        }
        subtitle={
          editMode
            ? "visual edit mode"
            : activePage != null
              ? `page ${activePage}`
              : ""
        }
        icon={
          editMode === "crop" ? (
            <Crop className="w-3 h-3 text-primary" />
          ) : editMode === "reorder" ? (
            <GripVertical className="w-3 h-3 text-primary" />
          ) : (
            <FileText className="w-3 h-3 text-muted-foreground" />
          )
        }
        onTogglePane={editMode ? undefined : onTogglePane}
      />

      {editMode === "reorder" ? (
        <PageReorderView doc={doc} onCancel={onEditModeCancel} />
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden relative">
          {pdfViewer}
          {editMode === "crop" && (
            <CropOverlay
              doc={doc}
              pagesInput={cropPagesInput}
              onCancel={onEditModeCancel}
            />
          )}
        </div>
      )}
    </section>
  );
}

// ── Shared save helper (mirrors ManipulationPanel's saveDerivative) ───────────

async function saveAsCropDerivative(params: {
  doc: PdfDocument;
  userId: string;
  result: BinaryResult;
  cropBox: { x0: number; y0: number; x1: number; y1: number };
  pages?: number[];
}): Promise<{ docId: string | null; error: string | null }> {
  const { doc, userId, result, cropBox, pages } = params;
  const file = new File([result.blob], result.filename, {
    type: "application/pdf",
  });
  let fileId: string, storageUri: string;
  try {
    const { data } = await uploadFile({
      file,
      filePath: `derivatives/${doc.id}/${result.filename}`,
    });
    fileId = data.file_id;
    storageUri = data.storage_uri;
  } catch (err) {
    return {
      docId: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const { data: newDoc, error: insertError } = await supabase
    .from("processed_documents")
    .insert({
      name: result.filename.replace(/\.pdf$/i, ""),
      storage_uri: storageUri,
      source_kind: "cld_file",
      source_id: fileId,
      source_hash: "",
      owner_id: userId,
      parent_processed_id: doc.id,
      derivation_kind: "crop_pages",
      derivation_metadata: {
        crop_box: cropBox,
        pages_cropped: pages ?? "all",
        original_name: doc.name,
        original_total_pages: doc.totalPages,
        content_note:
          "Cropped region — re-extract content for updated text index",
      },
      mime_type: "application/pdf",
    })
    .select("id")
    .single();
  if (insertError) return { docId: null, error: insertError.message };
  return { docId: (newDoc as { id: string }).id, error: null };
}

async function saveAsReorderDerivative(params: {
  doc: PdfDocument;
  userId: string;
  result: BinaryResult;
  newOrder: number[];
}): Promise<{ docId: string | null; error: string | null }> {
  const { doc, userId, result, newOrder } = params;
  const file = new File([result.blob], result.filename, {
    type: "application/pdf",
  });
  let fileId: string, storageUri: string;
  try {
    const { data } = await uploadFile({
      file,
      filePath: `derivatives/${doc.id}/${result.filename}`,
    });
    fileId = data.file_id;
    storageUri = data.storage_uri;
  } catch (err) {
    return {
      docId: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const { data: newDoc, error: insertError } = await supabase
    .from("processed_documents")
    .insert({
      name: result.filename.replace(/\.pdf$/i, ""),
      storage_uri: storageUri,
      source_kind: "cld_file",
      source_id: fileId,
      source_hash: "",
      owner_id: userId,
      parent_processed_id: doc.id,
      derivation_kind: "reorder_pages",
      derivation_metadata: { new_order: newOrder, original_name: doc.name },
      mime_type: "application/pdf",
    })
    .select("id")
    .single();
  if (insertError) return { docId: null, error: insertError.message };
  return { docId: (newDoc as { id: string }).id, error: null };
}

// ── Crop overlay ──────────────────────────────────────────────────────────────
//
// Renders as an absolute overlay over the PDF viewer. The user drags to draw a
// selection rectangle; clicking "Apply Crop" converts the pixel selection to PDF
// points and runs the API. The result appears inline with Download / Save buttons.
// NOTE: coordinate conversion assumes a standard US Letter page (612 × 792 pt).
// Non-standard page sizes will have slightly off coordinates — acceptable for V1.

function CropOverlay({
  doc,
  pagesInput,
  onCancel,
}: {
  doc: PdfDocument;
  pagesInput: string;
  onCancel: () => void;
}) {
  const api = usePdfDemoApi();
  const userId = useAppSelector(selectUserId) ?? "";
  const containerRef = useRef<HTMLDivElement>(null);

  const [dragging, setDragging] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [end, setEnd] = useState<{ x: number; y: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Last confirmed crop box (for save-as-derivative metadata)
  const cropBoxRef = useRef<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const pagesRef = useRef<number[] | undefined>(undefined);

  function clamp(val: number, min: number, max: number) {
    return Math.max(min, Math.min(val, max));
  }

  function getRelative(e: React.MouseEvent) {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: clamp(e.clientX - rect.left, 0, rect.width),
      y: clamp(e.clientY - rect.top, 0, rect.height),
    };
  }

  function onMouseDown(e: React.MouseEvent) {
    if (result) return;
    e.preventDefault();
    const pos = getRelative(e);
    setDragging(true);
    setStart(pos);
    setEnd(pos);
    setError(null);
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
    setEnd(getRelative(e));
  }
  function onMouseUp() {
    setDragging(false);
  }

  const selRect =
    start && end
      ? {
          left: Math.min(start.x, end.x),
          top: Math.min(start.y, end.y),
          width: Math.abs(end.x - start.x),
          height: Math.abs(end.y - start.y),
        }
      : null;

  const hasSelection = !!(selRect && selRect.width > 8 && selRect.height > 8);

  async function applyCrop() {
    if (!hasSelection || !selRect || !containerRef.current) return;
    const { width: W, height: H } =
      containerRef.current.getBoundingClientRect();
    // US Letter PDF coordinates: origin bottom-left, 612 × 792 pts
    const PDF_W = 612,
      PDF_H = 792;
    const cropBox = {
      x0: Math.round((selRect.left / W) * PDF_W),
      y0: Math.round((1 - (selRect.top + selRect.height) / H) * PDF_H),
      x1: Math.round(((selRect.left + selRect.width) / W) * PDF_W),
      y1: Math.round((1 - selRect.top / H) * PDF_H),
    };
    let pages: number[] | undefined;
    if (pagesInput.trim()) {
      try {
        pages = parsePagesInput(pagesInput);
      } catch {
        /* use all */
      }
    }
    cropBoxRef.current = cropBox;
    pagesRef.current = pages;

    const src: Record<string, unknown> | null =
      doc.sourceKind === "cld_file" && doc.sourceId
        ? { cld_id: doc.sourceId }
        : doc.source && !doc.source.startsWith("s3://")
          ? { url: doc.source }
          : null;
    if (!src) {
      setError("No source file linked.");
      return;
    }

    setRunning(true);
    setError(null);
    try {
      const blob = await api.postPdfBlob("cropPages", {
        ...src,
        ...(pages ? { pages } : {}),
        crop_box: cropBox,
      });
      setResult(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function handleSave() {
    if (!result || !cropBoxRef.current) return;
    setSaving(true);
    setSaveError(null);
    const { docId, error } = await saveAsCropDerivative({
      doc,
      userId,
      result,
      cropBox: cropBoxRef.current,
      pages: pagesRef.current,
    });
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    setSavedId(docId);
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10 select-none"
      style={{ cursor: result ? "default" : "crosshair" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* Dim overlay while drawing */}
      {!result && (
        <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      )}

      {/* Selection rectangle */}
      {selRect && !result && (
        <div
          className="absolute border-2 border-white pointer-events-none"
          style={{
            left: selRect.left,
            top: selRect.top,
            width: selRect.width,
            height: selRect.height,
            background: "rgba(255,255,255,0.08)",
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
          }}
        />
      )}

      {/* Top instruction / action bar */}
      <div className="absolute top-0 left-0 right-0 pointer-events-auto bg-background/95 backdrop-blur-sm border-b border-border px-3 py-2 flex items-center gap-2">
        <Crop className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-[11px] text-muted-foreground flex-1">
          {result
            ? `Crop complete — ${result.filename}`
            : hasSelection
              ? "Drag to adjust · click Apply Crop to process"
              : "Drag to draw the area to keep"}
          {pagesInput && !result && (
            <span className="ml-1 text-primary/80">· pages: {pagesInput}</span>
          )}
        </span>

        {!result && hasSelection && (
          <Button
            size="sm"
            className="h-7 text-[11px] px-2.5"
            disabled={running}
            onClick={() => void applyCrop()}
          >
            {running ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                Cropping…
              </>
            ) : (
              "Apply Crop"
            )}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[11px]"
          onClick={onCancel}
        >
          {result ? "Done" : "Cancel"}
        </Button>
      </div>

      {/* Bottom result bar */}
      {result && (
        <div className="absolute bottom-0 left-0 right-0 pointer-events-auto bg-background/95 backdrop-blur-sm border-t border-border px-3 py-2 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] px-2"
            onClick={() => {
              const url = URL.createObjectURL(result.blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = result.filename;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="w-3 h-3 mr-1" />
            Download
          </Button>
          {savedId ? (
            <span className="text-[11px] text-green-600 dark:text-green-400">
              Saved as document ✓
            </span>
          ) : (
            <Button
              size="sm"
              className="h-7 text-[11px] px-2"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <Save className="w-3 h-3 mr-1" />
              )}
              Save as document
            </Button>
          )}
          {saveError && (
            <p className="text-[11px] text-destructive w-full">{saveError}</p>
          )}
        </div>
      )}

      {error && (
        <div className="absolute bottom-2 left-2 right-2 pointer-events-auto bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5">
          <p className="text-[11px] text-destructive">{error}</p>
        </div>
      )}
    </div>
  );
}

// ── Page reorder view ─────────────────────────────────────────────────────────
//
// Replaces the PDF viewer with a draggable tile grid (one numbered tile per page).
// V1 shows page numbers only — no thumbnail rendering. This keeps the component
// light while giving users the core drag-to-reorder affordance. Actual thumbnails
// can be added in V2 by rendering each page via PdfDocumentRenderer at small size.

function PageReorderView({
  doc,
  onCancel,
}: {
  doc: PdfDocument;
  onCancel: () => void;
}) {
  const api = usePdfDemoApi();
  const userId = useAppSelector(selectUserId) ?? "";
  const totalPages = doc.totalPages ?? 1;

  const [order, setOrder] = useState<number[]>(() =>
    Array.from({ length: totalPages }, (_, i) => i + 1),
  );
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BinaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const src: Record<string, unknown> | null =
    doc.sourceKind === "cld_file" && doc.sourceId
      ? { cld_id: doc.sourceId }
      : doc.source && !doc.source.startsWith("s3://")
        ? { url: doc.source }
        : null;

  function onDragStart(idx: number) {
    setDragIdx(idx);
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function onDrop(idx: number) {
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null);
      return;
    }
    const next = [...order];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    setOrder(next);
    setDragIdx(null);
  }

  async function applyOrder() {
    if (!src) {
      setError("No source file linked.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const blob = await api.postPdfBlob("reorderPages", {
        ...src,
        new_order: order,
      });
      setResult(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function handleSave() {
    if (!result) return;
    setSaving(true);
    setSaveError(null);
    const { docId, error } = await saveAsReorderDerivative({
      doc,
      userId,
      result,
      newOrder: order,
    });
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    setSavedId(docId);
  }

  const isDefaultOrder = order.every((n, i) => n === i + 1);

  return (
    <div className="flex flex-col h-full bg-muted/10">
      {/* Header bar */}
      <div className="shrink-0 px-3 py-2 border-b border-border bg-card/60 flex items-center gap-2">
        <GripVertical className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-[11px] text-muted-foreground flex-1">
          {result
            ? `Reorder complete — ${result.filename}`
            : isDefaultOrder
              ? "Drag tiles to change page order"
              : `New order: ${order.join(", ")}`}
        </span>

        {!result && (
          <Button
            size="sm"
            className="h-7 text-[11px] px-2.5"
            disabled={running || isDefaultOrder}
            onClick={() => void applyOrder()}
            title={isDefaultOrder ? "Rearrange pages first" : undefined}
          >
            {running ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                Applying…
              </>
            ) : (
              "Apply Order"
            )}
          </Button>
        )}

        {result && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] px-2"
              onClick={() => {
                const url = URL.createObjectURL(result.blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = result.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="w-3 h-3 mr-1" />
              Download
            </Button>
            {savedId ? (
              <span className="text-[11px] text-green-600 dark:text-green-400">
                Saved ✓
              </span>
            ) : (
              <Button
                size="sm"
                className="h-7 text-[11px] px-2"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : (
                  <Save className="w-3 h-3 mr-1" />
                )}
                Save
              </Button>
            )}
          </>
        )}

        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[11px]"
          onClick={onCancel}
        >
          {result ? "Done" : "Cancel"}
        </Button>
      </div>

      {saveError && (
        <p className="shrink-0 px-3 py-1 text-[11px] text-destructive bg-destructive/5 border-b border-destructive/20">
          {saveError}
        </p>
      )}

      {/* Tile grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-3 gap-2">
          {order.map((pageNum, idx) => (
            <div
              key={pageNum}
              draggable={!result}
              onDragStart={() => onDragStart(idx)}
              onDragOver={onDragOver}
              onDrop={() => onDrop(idx)}
              className={cn(
                "aspect-[3/4] flex flex-col items-center justify-center gap-0.5 rounded-md border transition-all select-none",
                result
                  ? "border-border bg-card/60 cursor-default"
                  : dragIdx === idx
                    ? "opacity-40 scale-95 border-primary bg-primary/5 cursor-grabbing"
                    : "border-border bg-card hover:border-primary/50 hover:bg-accent/30 cursor-grab",
              )}
            >
              <span className="text-2xl font-mono font-bold text-muted-foreground/40 leading-none">
                {pageNum}
              </span>
              <span className="text-[9px] text-muted-foreground/70 uppercase tracking-wide">
                page
              </span>
              {idx !== pageNum - 1 && !result && (
                <span className="text-[9px] text-primary/70 font-mono">
                  pos {idx + 1}
                </span>
              )}
            </div>
          ))}
        </div>

        {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}

        {totalPages > 20 && !result && (
          <p className="mt-2 text-[10px] text-muted-foreground/60 text-center">
            {totalPages} pages — drag to rearrange
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function PdfPaneEmptyState({
  doc,
  onOpenUpload,
}: {
  doc: PdfDocument;
  onOpenUpload: () => void;
}) {
  // No `storage_uri` on this row — most likely a legacy doc that was
  // backfilled into `processed_documents` without its source URL. The user
  // needs a real action, not just an error message.
  return (
    <div className="flex items-center justify-center h-full p-6">
      <div className="max-w-sm text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/15 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            No source PDF linked to this record
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
            This document predates the new ingestion pipeline, so the original
            file isn't reachable from a stored URL. The extracted text on the
            right is still yours — re-upload the same PDF to relink it for
            side-by-side viewing.
          </p>
        </div>
        <div className="flex flex-col gap-2 items-center">
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={onOpenUpload}
          >
            <Upload className="w-3.5 h-3.5" />
            Re-upload to relink
          </Button>
          <p className="text-[10px] text-muted-foreground/70 font-mono">
            sourceKind: {doc.sourceKind ?? "(null)"}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Text pane (raw or cleaned) ────────────────────────────────────────────

function TextPane({
  paneKey,
  title,
  subtitle,
  icon,
  doc,
  pages,
  field,
  activePage,
  onActivePage,
  pendingScrollPage,
  onScrollHandled,
  lastScrolledPaneRef,
  findQuery,
  onTogglePane,
  highlightSection,
  allPagesEmpty,
  onRunPipeline,
  pipelineRunning,
  onRefreshPages,
}: {
  paneKey: PaneKey;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  doc: PdfDocument;
  pages: PdfPageRow[];
  field: "raw" | "cleaned";
  activePage: number | null;
  onActivePage: (page: number) => void;
  pendingScrollPage: number | null;
  onScrollHandled: () => void;
  lastScrolledPaneRef: React.MutableRefObject<PaneKey | null>;
  findQuery: string;
  onTogglePane: () => void;
  highlightSection?: boolean;
  allPagesEmpty: boolean;
  onRunPipeline: () => void | Promise<unknown>;
  pipelineRunning: boolean;
  onRefreshPages: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const anchorMap = useRef<Map<number, HTMLElement>>(new Map());
  // True while a code-driven scroll is in flight — blocks the IntersectionObserver
  // from feeding stale page numbers back into activePage mid-animation.
  const isProgrammaticRef = useRef(false);
  // The last page number emitted by THIS pane's own IntersectionObserver.
  // Used to avoid reacting to activePage changes that we ourselves caused.
  const selfEmittedPageRef = useRef<number | null>(null);

  // Local overrides applied after the user saves an inline edit.
  // Map<pageId, editedText> — cleared only on full page refresh or doc change.
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map());

  // Clear overrides when the doc changes.
  useEffect(() => {
    setOverrides(new Map());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  // Track when this pane is the active scroller — so the IntersectionObserver
  // only emits while the user is actually interacting with it.
  const onScrollStart = useCallback(() => {
    if (isProgrammaticRef.current) return; // programmatic scroll — don't steal the wheel
    lastScrolledPaneRef.current = paneKey;
  }, [paneKey, lastScrolledPaneRef]);

  // IntersectionObserver — emit the most-visible page only when the user is
  // actively scrolling this pane (not during a code-driven animation).
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Only fire when the user is scrolling THIS pane.
        if (lastScrolledPaneRef.current !== paneKey) return;
        // Suppress during programmatic scrolls — otherwise smooth-scroll
        // animations emit stale page numbers that cause the "off by one" drift.
        if (isProgrammaticRef.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const page = Number(visible.target.getAttribute("data-page") ?? 0);
        if (page) {
          selfEmittedPageRef.current = page;
          onActivePage(page);
        }
      },
      { root, threshold: [0.1, 0.25, 0.5] },
    );
    anchorMap.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pages.length, paneKey, lastScrolledPaneRef, onActivePage]);

  // Pin the top of `pageNumber` to the top of this pane's scroll container.
  function pinPageToTop(pageNumber: number) {
    const container = containerRef.current;
    const el = anchorMap.current.get(pageNumber);
    if (!container || !el) return;
    const target =
      container.scrollTop +
      (el.getBoundingClientRect().top - container.getBoundingClientRect().top);
    container.scrollTo({ top: target, behavior: "smooth" });
  }

  // Follow an activePage change from any external source (PDF, sibling pane,
  // sidebar nav). Only skip when WE emitted this exact page number ourselves —
  // not whenever we were the last scrolled pane (old logic was too broad and
  // caused this pane to stop syncing with the PDF after the user touched it).
  useEffect(() => {
    if (activePage == null) return;
    if (selfEmittedPageRef.current === activePage) {
      // We caused this — clear the flag and do nothing to avoid a loop.
      selfEmittedPageRef.current = null;
      return;
    }
    isProgrammaticRef.current = true;
    pinPageToTop(activePage);
    const t = setTimeout(() => {
      isProgrammaticRef.current = false;
    }, 700);
    return () => clearTimeout(t);
    // Only activePage matters — refs are stable and don't need to be deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage]);

  // Programmatic scroll when an external action sets `pendingScrollPage`
  // (toolbar PageJumper, sibling pane click, sidebar nav).
  useEffect(() => {
    if (pendingScrollPage == null) return;
    isProgrammaticRef.current = true;
    pinPageToTop(pendingScrollPage);
    setTimeout(() => {
      isProgrammaticRef.current = false;
    }, 700);
    // Clear the pending state — toolbar can re-issue immediately.
    onScrollHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingScrollPage]);

  // When ALL per-page rows are empty, fall back to the aggregate text that
  // lives on `processed_documents` itself — that's what the pipeline writes
  // into `content` / `clean_content`. This is the path that makes the
  // "blank page 1, page 2 …" state actionable instead of frustrating.
  const aggregateText =
    field === "cleaned" ? (doc.cleanContent ?? "") : (doc.content ?? "");

  // Build the text for the pane-level copy button. Honors live per-page edits
  // (`overrides`) and falls back to the aggregate doc text when every page row
  // is empty — same fallback the rendered pane uses.
  const buildPaneText = useCallback(() => {
    if (allPagesEmpty) return aggregateText;
    return pages
      .map((p) => {
        const base = field === "cleaned" ? p.cleanedText : p.rawText;
        const text = overrides.get(p.id) ?? base;
        return `--- Page ${p.pageNumber} ---\n${text}`;
      })
      .join("\n\n");
  }, [pages, field, overrides, allPagesEmpty, aggregateText]);

  return (
    <section className="flex-1 min-w-0 flex flex-col border-r last:border-r-0 border-border">
      <PaneHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        onTogglePane={onTogglePane}
        onCopyAll={buildPaneText}
        copyAllLabel={`Copy all ${field === "cleaned" ? "cleaned" : "raw"} pages`}
      />

      {allPagesEmpty && (
        <BlankPagesBanner
          docHasAggregate={!!aggregateText}
          field={field}
          onRunPipeline={onRunPipeline}
          pipelineRunning={pipelineRunning}
        />
      )}

      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-2"
        onScroll={onScrollStart}
        onWheel={onScrollStart}
        onTouchMove={onScrollStart}
      >
        {allPagesEmpty && aggregateText && (
          // Surface the aggregate document text so the user can actually
          // read what's there. We render it as a single block, NOT as N
          // empty page rows, since per-page persistence didn't work.
          <div className="border border-border bg-card rounded-md p-2.5">
            <div className="flex items-center gap-1.5 mb-1.5 text-[10px] text-muted-foreground">
              <span className="font-mono font-semibold text-foreground/80">
                Document text (aggregate)
              </span>
              <span className="ml-auto font-mono">
                {aggregateText.length.toLocaleString()} chars
              </span>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/85">
              <Highlighted text={aggregateText} query={findQuery} />
            </pre>
          </div>
        )}

        {pages.map((p) => {
          // Skip per-page rows when the whole set is empty — they'd just
          // print "no text on this page" N times.
          if (allPagesEmpty) return null;
          const baseText = field === "cleaned" ? p.cleanedText : p.rawText;
          const text = overrides.get(p.id) ?? baseText;
          const isActive = activePage === p.pageNumber;
          return (
            <PageBlock
              key={p.id}
              page={p}
              text={text}
              field={field}
              isActive={isActive}
              highlightSection={highlightSection}
              findQuery={findQuery}
              onClick={() => onActivePage(p.pageNumber)}
              registerAnchor={(el) => {
                if (el) anchorMap.current.set(p.pageNumber, el);
                else anchorMap.current.delete(p.pageNumber);
              }}
              onSaved={(pageId, savedText) => {
                setOverrides((prev) => {
                  const next = new Map(prev);
                  next.set(pageId, savedText);
                  return next;
                });
              }}
              onReClean={async () => {
                await onRunPipeline();
                onRefreshPages();
              }}
            />
          );
        })}
      </div>
    </section>
  );
}

function BlankPagesBanner({
  docHasAggregate,
  field,
  onRunPipeline,
  pipelineRunning,
}: {
  docHasAggregate: boolean;
  field: "raw" | "cleaned";
  onRunPipeline: () => void | Promise<unknown>;
  pipelineRunning: boolean;
}) {
  return (
    <div className="shrink-0 mx-2 mt-2 border border-amber-500/30 bg-amber-500/5 rounded-md p-2.5 text-[11px] text-amber-700 dark:text-amber-400">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-medium">
            Per-page rows exist for this doc, but every page is empty.
          </p>
          <p className="mt-0.5 text-amber-700/90 dark:text-amber-300/80 leading-snug">
            {docHasAggregate
              ? "Showing the aggregate document text below as a fallback. Re-run the pipeline to populate per-page rows so synced scrolling and word-level highlighting work."
              : `No ${field === "cleaned" ? "cleaned" : "raw"} text was persisted. Re-run the pipeline to repopulate.`}
          </p>
          <div className="mt-1.5">
            <Button
              size="sm"
              className="h-7 text-[11px] gap-1"
              onClick={() => void onRunPipeline()}
              disabled={pipelineRunning}
            >
              {pipelineRunning ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Re-running…
                </>
              ) : (
                <>
                  <Wand2 className="w-3 h-3" />
                  Re-run pipeline
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page block — one row per page in a text pane ──────────────────────────

function PageBlock({
  page,
  text,
  field,
  isActive,
  highlightSection,
  findQuery,
  onClick,
  registerAnchor,
  onSaved,
  onReClean,
}: {
  page: PdfPageRow;
  text: string;
  field: "raw" | "cleaned";
  isActive: boolean;
  highlightSection?: boolean;
  findQuery: string;
  onClick: () => void;
  registerAnchor: (el: HTMLDivElement | null) => void;
  onSaved: (pageId: string, savedText: string) => void;
  onReClean: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(text);
  const [saving, setSaving] = useState(false);
  const [reCleaning, setReCleaning] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Keep edit buffer in sync when text prop changes externally (e.g. after re-clean refresh).
  useEffect(() => {
    if (!editing) setEditText(text);
  }, [text, editing]);

  const isDirty = editing && editText !== text;

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    const col = field === "cleaned" ? "cleaned_text" : "raw_text";
    const charCol =
      field === "cleaned" ? "cleaned_char_count" : "raw_char_count";
    const { error } = await supabase
      .from("processed_document_pages")
      .update({ [col]: editText, [charCol]: editText.length })
      .eq("id", page.id);
    setSaving(false);
    if (error) {
      setSaveError(error.message);
    } else {
      setEditing(false);
      onSaved(page.id, editText);
    }
  }

  function handleCancel() {
    setEditing(false);
    setEditText(text);
    setSaveError(null);
  }

  async function handleReClean() {
    setReCleaning(true);
    try {
      await onReClean();
    } finally {
      setReCleaning(false);
    }
  }

  const charCount = editing
    ? editText.length
    : field === "cleaned"
      ? page.cleanedCharCount
      : page.rawCharCount;

  return (
    <div
      data-page={page.pageNumber}
      ref={registerAnchor}
      className={cn(
        "group border rounded-md text-[11px] leading-relaxed transition-colors",
        isActive
          ? "border-primary/50 bg-primary/5 shadow-sm"
          : "border-border bg-card",
        !editing && "cursor-pointer hover:bg-accent/30",
      )}
      onClick={editing ? undefined : onClick}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 text-[10px] text-muted-foreground">
        <span className="font-mono font-semibold text-foreground/80">
          page {page.pageNumber}
        </span>
        {page.usedOcr && (
          <span className="px-1 py-px rounded bg-amber-500/10 text-amber-700 dark:text-amber-400">
            OCR
          </span>
        )}
        {highlightSection && page.sectionKind && (
          <span className="px-1 py-px rounded bg-primary/10 text-primary truncate max-w-[120px]">
            {page.sectionKind}
            {page.sectionTitle && ` · ${page.sectionTitle}`}
          </span>
        )}
        <span className="font-mono">{charCount.toLocaleString()}</span>

        {/* Action buttons — right side */}
        <div className="ml-auto flex items-center gap-0.5">
          {editing ? (
            <>
              {field === "raw" && (
                <button
                  type="button"
                  title="Re-clean this page with AI (re-runs full doc clean)"
                  disabled={reCleaning || saving}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleReClean();
                  }}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
                >
                  {reCleaning ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-2.5 h-2.5" />
                  )}
                  Re-clean
                </button>
              )}
              {isDirty && (
                <button
                  type="button"
                  title="Save changes"
                  disabled={saving}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleSave();
                  }}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-success/10 text-success hover:bg-success/20 disabled:opacity-50 transition-colors"
                >
                  {saving ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  ) : (
                    <Check className="w-2.5 h-2.5" />
                  )}
                  Save
                </button>
              )}
              <button
                type="button"
                title="Cancel edit"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel();
                }}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          ) : (
            <>
              <CopyIconButton
                getText={() => text}
                label={`Copy page ${page.pageNumber}`}
                hoverReveal
              />
              <button
                type="button"
                title="Edit this page's text"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                }}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent opacity-0 group-hover:opacity-100 transition-all"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {saveError && (
        <p className="mx-2 mb-1 text-[10px] text-destructive">{saveError}</p>
      )}

      {/* Body */}
      {editing ? (
        <textarea
          autoFocus
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          spellCheck={false}
          className="w-full px-2 pb-2 font-mono text-[11px] leading-relaxed resize-y bg-transparent text-foreground/85 outline-none border-0 min-h-[6rem]"
          style={{ fontSize: 11 }}
        />
      ) : (
        <pre className="whitespace-pre-wrap font-mono text-foreground/85 leading-relaxed px-2 pb-2">
          <Highlighted text={text} query={findQuery} />
        </pre>
      )}
    </div>
  );
}

// ── Inline find-highlight ─────────────────────────────────────────────────

function Highlighted({ text, query }: { text: string; query: string }) {
  const segments = useMemo(() => {
    if (!query.trim() || !text) return [{ text, match: false }];
    const q = query.trim();
    const lower = text.toLowerCase();
    const lq = q.toLowerCase();
    const out: { text: string; match: boolean }[] = [];
    let i = 0;
    while (i < text.length) {
      const at = lower.indexOf(lq, i);
      if (at < 0) {
        out.push({ text: text.slice(i), match: false });
        break;
      }
      if (at > i) out.push({ text: text.slice(i, at), match: false });
      out.push({ text: text.slice(at, at + q.length), match: true });
      i = at + q.length;
    }
    return out;
  }, [text, query]);

  if (segments.length === 1 && !segments[0].match) {
    return (
      <>
        {segments[0].text || (
          <span className="italic text-muted-foreground">
            (no text on this page)
          </span>
        )}
      </>
    );
  }

  return (
    <>
      {segments.map((s, i) =>
        s.match ? (
          <mark
            key={i}
            className="rounded bg-amber-300/40 text-foreground px-0.5"
          >
            {s.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        ),
      )}
    </>
  );
}

// ── Pane header (shared) ──────────────────────────────────────────────────

function PaneHeader({
  title,
  subtitle,
  icon,
  onTogglePane,
  onCopyAll,
  copyAllLabel,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onTogglePane?: () => void;
  /** Returns the text to copy for the entire pane. When provided, renders a
   *  copy-to-clipboard button next to the EyeOff visibility toggle. */
  onCopyAll?: () => string;
  copyAllLabel?: string;
}) {
  const hasActions = !!(onCopyAll || onTogglePane);
  return (
    <div className="shrink-0 px-2.5 py-1.5 border-b border-border flex items-center gap-1.5">
      {icon}
      <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/80">
        {title}
      </span>
      {subtitle && (
        <span className="text-[10px] text-muted-foreground">· {subtitle}</span>
      )}
      {hasActions && (
        <div className="ml-auto flex items-center gap-0.5">
          {onCopyAll && (
            <CopyIconButton
              getText={onCopyAll}
              label={copyAllLabel ?? "Copy all pages"}
            />
          )}
          {onTogglePane && (
            <button
              type="button"
              onClick={onTogglePane}
              className="p-0.5 text-muted-foreground/60 hover:text-foreground rounded transition-colors"
              title="Hide pane"
            >
              <EyeOff className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Small copy-to-clipboard icon button. Shows a green check on success.
 * `getText` is invoked at click time so the caller can build the latest
 * snapshot of the text rather than memoizing it eagerly.
 *
 * `hoverReveal` makes the button hidden until the closest `.group` ancestor
 * is hovered — used for per-row copy buttons inside `PageBlock`.
 */
function CopyIconButton({
  getText,
  label,
  hoverReveal,
}: {
  getText: () => string;
  label: string;
  hoverReveal?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(getText());
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // ignore — most clipboard failures are silent permission denials
      }
    },
    [getText],
  );
  return (
    <button
      type="button"
      onClick={handleClick}
      title={label}
      aria-label={label}
      className={cn(
        "p-0.5 rounded transition-colors",
        copied
          ? "text-emerald-500"
          : "text-muted-foreground/60 hover:text-foreground hover:bg-accent",
        hoverReveal &&
          !copied &&
          "opacity-0 group-hover:opacity-100 transition-all",
        hoverReveal && copied && "opacity-100",
      )}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ── Loading + legacy fallback ─────────────────────────────────────────────

function ReaderSkeleton({ visiblePanes }: { visiblePanes: Set<PaneKey> }) {
  return (
    <div className="flex flex-1 min-h-0">
      {Array.from(visiblePanes).map((pane) => (
        <div
          key={pane}
          className="flex-1 min-w-0 flex flex-col border-r last:border-r-0 border-border p-3 gap-2"
        >
          <div className="h-5 w-32 rounded bg-muted/50 animate-pulse" />
          <div className="h-32 w-full rounded bg-muted/40 animate-pulse" />
          <div className="h-32 w-full rounded bg-muted/40 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function LegacyReaderFallback({ doc }: { doc: PdfDocument }) {
  return (
    <div className="flex flex-1 min-h-0">
      {/* PDF pane — use the proper renderer, not an iframe */}
      <div className="flex-1 min-w-0 flex flex-col border-r border-border bg-muted/10">
        <div className="shrink-0 px-2.5 py-1.5 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Source PDF
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          {doc.sourceKind === "cld_file" && doc.sourceId ? (
            <PdfCldFileViewer fileId={doc.sourceId} fileName={doc.name} />
          ) : doc.source && !doc.source.startsWith("s3://") ? (
            <PdfStudioUrlViewer url={doc.source} fileName={doc.name} />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <p className="text-[11px] text-muted-foreground">
                No source PDF linked to this record.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Text pane */}
      <div className="flex-1 min-w-0 flex flex-col p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">
          Document content (no per-page rows yet)
        </div>
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-md p-3 mb-3 text-[11px] text-amber-700 dark:text-amber-400">
          Run the pipeline from the toolbar above to populate
          <code className="mx-1 px-1 bg-card border border-border rounded text-[10px]">
            processed_document_pages
          </code>
          and unlock synced scrolling, find-in-doc, and bbox overlays.
        </div>
        <pre className="flex-1 min-h-0 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/85">
          {doc.cleanContent ?? doc.content ?? "(no extracted text)"}
        </pre>
      </div>
    </div>
  );
}
