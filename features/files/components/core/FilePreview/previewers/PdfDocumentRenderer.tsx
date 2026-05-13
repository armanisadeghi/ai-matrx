/**
 * features/files/components/core/FilePreview/previewers/PdfDocumentRenderer.tsx
 *
 * Presentational core for every PDF surface in the app. Owns:
 *
 *   - The react-pdf `<Document>` / `<Page>` mount + worker config
 *   - The toolbar (zoom in/out, fit page, fit width, actual size, rotate)
 *   - Page navigation (prev / next + counter)
 *   - The sizing model: ResizeObserver-driven container measurement,
 *     post-rotation effective dimensions, and `scale = min(availW /
 *     effW, availH / effH)` so fit-page expands until ONE axis fills
 *     and then stops
 *   - The error / loading branches (consistent visuals across surfaces)
 *
 * It does NOT know how to obtain the bytes. Callers fetch the PDF
 * however they like (Python `/files/{id}/download` proxy, public S3
 * URL, drag-dropped File, etc.) and hand a same-origin `blob:` URL
 * here. That keeps the renderer 100% stable across surfaces — adding a
 * new place to view PDFs (admin tools, share preview, etc.) is one
 * thin wrapper, not another 300-line copy of the toolbar.
 *
 * The cld_files-backed `PdfPreview` and the pdf-extractor `PdfStudioUrlViewer`
 * are now both ~30-line wrappers that fetch bytes their own way and
 * delegate rendering to this component. Bugs fixed here propagate to
 * both surfaces automatically.
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
import { Document, Page, pdfjs } from "react-pdf";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize,
  Maximize2,
  Minus,
  Plus,
  RotateCw,
  Scaling,
} from "lucide-react";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { cn } from "@/lib/utils";
import { TooltipIcon } from "@/features/files/components/core/Tooltip/TooltipIcon";
import { FileFetchProgress } from "../FileFetchProgress";

// Worker source — pinned to the installed pdfjs version and served from
// our own origin (`/public/pdfjs/pdf.worker.min.mjs`, mirrored by a post-
// install script). Set once at module load. Both wrappers (cld_files
// PdfPreview, URL-based viewer) import this module before mounting any
// <Document>, so this runs before pdfjs needs a worker.
//
// Why same-origin: progressive Range rendering needs the SW to see the
// PDF byte fetches; an unpkg-hosted worker is itself cross-origin and
// can introduce CORS preflights on its own initialization. Same-origin
// is the dependable path now that we cache PDF bytes locally and want
// the entire fetch graph to flow through our SW.
if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PdfDocumentRendererProps {
  /**
   * Same-origin blob URL pointing at the PDF bytes. `null` while the
   * caller is still fetching (or before fetch starts).
   *
   * IMPORTANT: must be a stable URL across renders. Wrappers should
   * memoise the URL so react-pdf's `<Document>` doesn't re-load on
   * every parent re-render.
   *
   * **Prefer `remoteUrl` for new code.** A `blob:` URL forces the caller
   * to pre-fetch the entire file before rendering begins, which defeats
   * pdfjs's native HTTP Range / progressive-loading support and blocks
   * the first-page paint on the full download. `remoteUrl` lets pdfjs
   * stream pages as bytes arrive (and lets the SW serve 206 Partial
   * Content from cache instead of re-downloading).
   */
  blobUrl?: string | null;

  /**
   * Remote URL for the PDF bytes — typically the Python
   * `/files/{id}/download` endpoint or a same-origin S3 URL. When set,
   * the renderer hands pdfjs the URL directly along with `remoteHeaders`
   * and lets pdfjs perform progressive Range fetches. Pages render as
   * their bytes arrive; first-page paint typically lands long before
   * the document finishes downloading.
   *
   * The blob-cache Service Worker (registered in app/DeferredSingletons)
   * sees these fetches and serves 206 Partial Content from cache when
   * the file is already known locally. On a cache miss, the network
   * fetch primes the cache for next time.
   *
   * Either `blobUrl` OR `remoteUrl` — never both. `remoteUrl` wins if
   * both are provided.
   */
  remoteUrl?: string | null;

  /**
   * HTTP headers applied to every pdfjs byte fetch (typically
   * `Authorization: Bearer …` for the Python download endpoint). Pass
   * an empty object for unauthenticated URLs (Supabase Storage public,
   * external mirrors). Only consulted when `remoteUrl` is set.
   */
  remoteHeaders?: Record<string, string>;

  /**
   * Forwarded to pdfjs as `withCredentials`. Default `false` because our
   * download endpoint is `Authorization` header-based, not cookie-based.
   * Only relevant in conjunction with `remoteUrl`.
   */
  withCredentials?: boolean;
  /** Filename — surfaced in the loading + error UIs. */
  fileName?: string | null;

  /**
   * Caller-managed loading state. When `true`, the renderer shows the
   * shared `<FileFetchProgress/>` UI instead of the document.
   */
  loading?: boolean;
  bytesLoaded?: number;
  bytesTotal?: number | null;

  /**
   * Caller-managed error string. When set, the renderer shows the
   * error card instead of the document. The renderer also surfaces
   * its own internal load errors (e.g. malformed PDF) on top of this.
   */
  error?: string | null;

  /**
   * Optional controlled page (1-based). When set, the parent owns the
   * page state and the renderer emits changes via `onPageChange`. Used
   * by the PDF Studio to drive scroll sync from the text panes.
   */
  pageNumber?: number;
  onPageChange?: (page: number) => void;

  /**
   * Optional render-slot for an overlay mounted directly on top of the
   * rendered `<Page>` element. The renderer hands the caller the page
   * geometry it needs to translate PDF user-space points into canvas
   * pixels (the `<PdfAnnotationLayer/>` primitive uses exactly this).
   *
   * Use cases:
   *   - Drawing annotation rectangles in the studio / analysis tab.
   *   - Highlighting search hits.
   *   - Showing a "this page is excluded" dim-out.
   *
   * The slot wraps in a flex-positioned container sized to match the
   * page canvas. Children must position themselves absolutely.
   */
  renderOverlay?: (info: {
    pageNumber: number;
    pageWidthPt: number;
    pageHeightPt: number;
    rotation: number;
  }) => React.ReactNode;

  className?: string;
}

type ZoomMode =
  // Fit page — biggest scale that keeps BOTH width and height inside the
  // available space. Default. The proper definition of "fit": expand
  // until ONE axis fills, then stop.
  | { kind: "fit" }
  // Fit width — biggest scale where page width matches available width;
  // height may overflow and scroll. Useful for tall pages where small
  // fit-page text is worse than scrolling.
  | { kind: "fit-width" }
  // 100% physical size — page renders at its natural pixel size (×1.5
  // because react-pdf's 1.0 = 72 DPI feels too small on hi-DPI).
  | { kind: "actual" }
  // Explicit zoom level (0.25 → 4.0).
  | { kind: "scale"; scale: number };

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const STEP = 0.25;
const ACTUAL_SIZE_SCALE = 1.5;
// Reserve a few px of padding on each side so the page doesn't kiss the
// scrollbar / border.
const VIEWPORT_PADDING_PX = 24;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PdfDocumentRenderer({
  blobUrl,
  remoteUrl,
  remoteHeaders,
  withCredentials = false,
  fileName,
  loading,
  bytesLoaded = 0,
  bytesTotal = null,
  error,
  pageNumber: controlledPage,
  onPageChange,
  renderOverlay,
  className,
}: PdfDocumentRendererProps) {
  const [numPages, setNumPages] = useState(0);
  const [internalPage, setInternalPage] = useState(1);
  // Controlled vs uncontrolled page — when the parent provides
  // `pageNumber` we mirror it and emit changes upward instead of
  // owning state.
  const pageNumber = controlledPage ?? internalPage;
  const setPageNumber = useCallback(
    (next: number | ((prev: number) => number)) => {
      const resolved = typeof next === "function" ? next(pageNumber) : next;
      if (controlledPage == null) setInternalPage(resolved);
      onPageChange?.(resolved);
    },
    [controlledPage, onPageChange, pageNumber],
  );

  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ZoomMode>({ kind: "fit" });
  const [rotation, setRotation] = useState(0);

  // Page natural dimensions (CSS pixels at scale 1.0, including any
  // intrinsic rotation the PDF declared). Populated from
  // `<Page onLoadSuccess>`. Used to compute true fit-page scale.
  const [pageDims, setPageDims] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // ── Container size via ResizeObserver — drives fit math on splitter
  //    drags / window resizes without a remount.
  //
  // Two failure modes we have to defend against:
  //   1. The first effect runs before the parent flex container has
  //      laid out — `clientWidth/Height` reads 0×0. If we then hit
  //      the fit-page math with 0 dims, the `Math.max(120, …)` floor
  //      below would yield a ridiculous ~15% scale and the PDF
  //      renders as a postage stamp. Layout-effect + re-poll on
  //      every paint until non-zero handles this.
  //   2. The container is briefly mounted inside `display: none` (the
  //      tab system uses `hidden` to keep blob caches warm). Going
  //      from hidden → visible IS supposed to fire ResizeObserver,
  //      but doesn't reliably across browsers. Polling on each render
  //      until measured is a cheap belt-and-suspenders.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });

  // Layout-effect — runs synchronously after DOM mutation, before paint.
  // Catches the initial measurement on the same frame as mount.
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const w = node.clientWidth;
    const h = node.clientHeight;
    setContainerSize((prev) =>
      prev.width === w && prev.height === h ? prev : { width: w, height: h },
    );
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const nextW = entry.contentRect.width;
        const nextH = entry.contentRect.height;
        setContainerSize((prev) =>
          prev.width === nextW && prev.height === nextH
            ? prev
            : { width: nextW, height: nextH },
        );
      }
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // Re-measure on every render UNTIL we have non-zero dims. Once
  // measured, this becomes a no-op. Cheap insurance for the "parent
  // was hidden during initial mount" case where the ResizeObserver
  // didn't fire on the display:none → block transition.
  useEffect(() => {
    if (containerSize.width > 0 && containerSize.height > 0) return;
    const node = containerRef.current;
    if (!node) return;
    const w = node.clientWidth;
    const h = node.clientHeight;
    if (w > 0 && h > 0) {
      setContainerSize({ width: w, height: h });
      return;
    }
    // Schedule another check on the next frame in case the layout is
    // mid-resolution. Animation frame batches naturally so this
    // doesn't spin even if we're in a long mount sequence.
    const raf = requestAnimationFrame(() => {
      const w2 = node.clientWidth;
      const h2 = node.clientHeight;
      if (w2 > 0 && h2 > 0) {
        setContainerSize({ width: w2, height: h2 });
      }
    });
    return () => cancelAnimationFrame(raf);
  });

  // Stable header serialization — pdfjs reloads the document whenever
  // the `file` prop's identity changes. Stringify headers so we don't
  // remount on a fresh object literal that happens to have the same
  // entries. The header set rarely changes (it's "Authorization: Bearer
  // …" 99% of the time) so the serialization cost is irrelevant.
  const remoteHeadersKey = useMemo(
    () => (remoteHeaders ? JSON.stringify(remoteHeaders) : ""),
    [remoteHeaders],
  );

  // Stable file descriptor — react-pdf reloads the document whenever
  // the `file` prop's identity changes, so memoise it. `remoteUrl`
  // wins when both are provided so the progressive path is the
  // forward-default.
  const documentFile = useMemo(() => {
    if (remoteUrl) {
      const headers = remoteHeadersKey
        ? (JSON.parse(remoteHeadersKey) as Record<string, string>)
        : undefined;
      // pdfjs accepts `url + httpHeaders + withCredentials` here and
      // will issue partial-content Range requests against `url` rather
      // than a single full-body GET. The SW intercepts those requests
      // and serves cached bytes as 206 when available.
      return {
        url: remoteUrl,
        httpHeaders: headers,
        withCredentials,
      };
    }
    if (blobUrl) return { url: blobUrl };
    return null;
  }, [remoteUrl, remoteHeadersKey, withCredentials, blobUrl]);

  // The "document identity" for the reset-on-new-document effect below.
  // Distinct from the memoised `documentFile` (whose identity tracks
  // header changes too) — we only want to reset state when the URL
  // itself changes.
  const documentIdentityKey = remoteUrl ?? blobUrl ?? null;

  // Reset internal sizing/error/page state when a NEW document loads
  // (i.e. the source URL flips). Without this, switching the source
  // (e.g. clicking a different doc in PDF Studio) would carry over
  // stale `pageDims` from the previous document and re-render with
  // the wrong natural dimensions.
  //
  // CRITICAL: this MUST NOT depend on `controlledPage` — the studio's
  // text pane drives `pageNumber` for scroll-sync, and including it
  // here would re-fit the page on every chunk click. Internal page
  // state is only reset when the document itself changes (uncontrolled
  // case), which is naturally bound to the source URL.
  useEffect(() => {
    setLoadError(null);
    setPageDims(null);
    setNumPages(0);
    setInternalPage(1);
    // Intentionally only `documentIdentityKey` — see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentIdentityKey]);

  const combinedError = loadError ?? error ?? null;

  // Effective dimensions AFTER user rotation. react-pdf's `<Page>`
  // rotates AFTER scaling, so we need to swap W/H ourselves to compare
  // against the container.
  const effectiveDims = useMemo(() => {
    if (!pageDims) return null;
    const flipped = rotation === 90 || rotation === 270;
    return flipped
      ? { width: pageDims.height, height: pageDims.width }
      : pageDims;
  }, [pageDims, rotation]);

  /**
   * Compute the `scale` we hand to `<Page>`. We use `scale` (not
   * `width`) because it composes correctly with rotation. Fit-page
   * expands until ONE axis fills and then stops.
   *
   * **Important:** for fit-modes, we REFUSE to compute a scale until
   * we have a real container measurement (both axes > 0). The old
   * `Math.max(120, …)` floor would yield ~15% when containerSize
   * was 0×0 (parent hidden / not yet laid out), which is the
   * "postage-stamp PDF" bug. Returning `null` lets `<Page>` render
   * at its natural size for the brief moment before the
   * ResizeObserver fires; it's MUCH less jarring than 15%.
   *
   * Explicit-percent / actual-size modes don't depend on the
   * container, so they're fine to compute regardless.
   */
  const containerMeasured =
    containerSize.width > 0 && containerSize.height > 0;

  const pageScale = useMemo(() => {
    // Explicit modes don't need a container measurement.
    if (zoom.kind === "actual") return ACTUAL_SIZE_SCALE;
    if (zoom.kind === "scale") return zoom.scale;

    // Fit modes need both the page natural dims AND a real container.
    if (
      !effectiveDims ||
      effectiveDims.width <= 0 ||
      effectiveDims.height <= 0
    ) {
      return null;
    }
    if (!containerMeasured) return null;

    const availW = containerSize.width - VIEWPORT_PADDING_PX * 2;
    const availH = containerSize.height - VIEWPORT_PADDING_PX * 2;
    // Defensive: in case the padding is bigger than the viewport
    // (very narrow popovers etc.) fall back to the natural scale
    // rather than producing a negative or absurd ratio.
    if (availW <= 0 || availH <= 0) return 1;

    switch (zoom.kind) {
      case "fit": {
        const sX = availW / effectiveDims.width;
        const sY = availH / effectiveDims.height;
        return Math.min(sX, sY);
      }
      case "fit-width":
        return availW / effectiveDims.width;
    }
  }, [containerMeasured, containerSize, effectiveDims, zoom]);

  const zoomLabel = useMemo(() => {
    if (zoom.kind === "fit") {
      return pageScale ? `Fit ${Math.round(pageScale * 100)}%` : "Fit";
    }
    if (zoom.kind === "fit-width") {
      return pageScale ? `Fit W ${Math.round(pageScale * 100)}%` : "Fit W";
    }
    if (zoom.kind === "actual") return "100%";
    return `${Math.round(zoom.scale * 100)}%`;
  }, [zoom, pageScale]);

  // Effective scale for the +/- step buttons — bumps from the actual
  // rendered size, not from a stale fit value.
  const currentScale =
    zoom.kind === "scale"
      ? zoom.scale
      : zoom.kind === "actual"
        ? ACTUAL_SIZE_SCALE
        : (pageScale ?? 1);

  const stepZoom = useCallback(
    (delta: number) => {
      setZoom({
        kind: "scale",
        scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, currentScale + delta)),
      });
    },
    [currentScale],
  );

  const handlePageLoadSuccess = useCallback(
    (page: {
      width: number;
      height: number;
      originalWidth?: number;
      originalHeight?: number;
    }) => {
      // CRITICAL: read `originalWidth`/`originalHeight`, not `width`/
      // `height`. The latter pair reflects the page's CURRENT rendered
      // size — i.e. post-scale. Feeding those into pageDims creates a
      // feedback loop where every re-render shrinks the page (compute
      // scale from already-scaled dims, then scale again). The
      // `original*` props are the natural PDF-points dimensions and
      // stay constant across renders.
      const naturalW = page.originalWidth ?? page.width;
      const naturalH = page.originalHeight ?? page.height;
      setPageDims((prev) => {
        if (prev && prev.width === naturalW && prev.height === naturalH) {
          return prev;
        }
        return { width: naturalW, height: naturalH };
      });
    },
    [],
  );

  // ── Render branches ────────────────────────────────────────────────

  if (combinedError) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center",
          className,
        )}
        role="alert"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Couldn&apos;t load this PDF</h3>
          <p className="max-w-md text-xs text-muted-foreground break-words">
            {combinedError}
          </p>
        </div>
      </div>
    );
  }

  if (loading || !documentFile) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-muted/20",
          className,
        )}
      >
        {bytesTotal != null || bytesLoaded > 0 ? (
          <FileFetchProgress
            fileName={fileName ?? null}
            bytesLoaded={bytesLoaded}
            bytesTotal={bytesTotal ?? null}
          />
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading PDF…</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex h-full w-full flex-col bg-muted/20", className)}>
      {/* Toolbar — zoom + rotate + page nav */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-background/80 px-3 py-1.5 text-xs shrink-0">
        <div className="flex items-center gap-1">
          <TooltipIcon label="Zoom out">
            <button
              type="button"
              onClick={() => stepZoom(-STEP)}
              disabled={currentScale <= MIN_SCALE}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          </TooltipIcon>
          <span className="min-w-[3.5rem] text-center text-xs font-medium tabular-nums">
            {zoomLabel}
          </span>
          <TooltipIcon label="Zoom in">
            <button
              type="button"
              onClick={() => stepZoom(+STEP)}
              disabled={currentScale >= MAX_SCALE}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </TooltipIcon>
          <span className="mx-1 h-4 w-px bg-border" />
          <TooltipIcon label="Fit page (default)">
            <button
              type="button"
              onClick={() => setZoom({ kind: "fit" })}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground",
                zoom.kind === "fit" && "bg-accent text-accent-foreground",
              )}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </TooltipIcon>
          <TooltipIcon label="Fit width">
            <button
              type="button"
              onClick={() => setZoom({ kind: "fit-width" })}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground",
                zoom.kind === "fit-width" &&
                  "bg-accent text-accent-foreground",
              )}
            >
              <Maximize className="h-3.5 w-3.5" />
            </button>
          </TooltipIcon>
          <TooltipIcon label="Actual size (100%)">
            <button
              type="button"
              onClick={() => setZoom({ kind: "actual" })}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground",
                zoom.kind === "actual" && "bg-accent text-accent-foreground",
              )}
            >
              <Scaling className="h-3.5 w-3.5" />
            </button>
          </TooltipIcon>
          <span className="mx-1 h-4 w-px bg-border" />
          <TooltipIcon label="Rotate 90°">
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          </TooltipIcon>
        </div>

        {numPages > 1 ? (
          <div
            className="flex items-center gap-1.5"
            aria-label="PDF pagination"
          >
            <button
              type="button"
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
              disabled={pageNumber <= 1}
              aria-label="Previous page"
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[3.5rem] text-center font-medium tabular-nums">
              {pageNumber} / {numPages}
            </span>
            <button
              type="button"
              onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
              disabled={pageNumber >= numPages}
              aria-label="Next page"
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      {/* Scrollable viewport — measured with ResizeObserver. */}
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto">
        <Document
          file={documentFile}
          onLoadSuccess={({ numPages: n }) => {
            setNumPages(n);
            setPageNumber((p) => Math.min(p, n));
          }}
          onLoadError={(err) => setLoadError(err.message)}
          loading={
            <div className="mt-6 h-6 w-40 animate-pulse rounded bg-muted" />
          }
          className="flex w-full flex-col items-center"
        >
          <div className="relative my-4 shadow-sm">
            <Page
              pageNumber={pageNumber}
              renderAnnotationLayer
              renderTextLayer
              // Use `scale` (not `width`) so rotation composes correctly:
              // react-pdf rotates AFTER scaling, so we don't need to swap
              // width/height ourselves. devicePixelRatio handling stays
              // internal to pdfjs.
              scale={pageScale && pageScale > 0 ? pageScale : undefined}
              rotate={rotation}
              onLoadSuccess={handlePageLoadSuccess}
            />
            {/* Overlay slot — annotation rectangles, search hits, etc.
              * Mounts absolutely-positioned on top of the rendered Page.
              * Caller positions children inside via PdfAnnotationLayer. */}
            {renderOverlay && pageDims
              ? renderOverlay({
                  pageNumber,
                  pageWidthPt: pageDims.width,
                  pageHeightPt: pageDims.height,
                  rotation,
                })
              : null}
          </div>
        </Document>
      </div>
    </div>
  );
}
