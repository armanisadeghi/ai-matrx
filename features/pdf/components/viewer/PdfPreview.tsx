/**
 * features/files/components/core/FilePreview/previewers/PdfPreview.tsx
 *
 * Cloud-files PDF previewer. Thin wrapper around the shared
 * `<PdfDocumentRenderer/>` core. Uses pdfjs's progressive Range-based
 * loading: pdfjs fetches the cross-ref table + first page's bytes and
 * paints them while the rest of the document streams in.
 *
 * Why progressive Range over pre-fetched blob URL
 * ────────────────────────────────────────────────
 * The old path fed `<Document>` a `blob:` URL built from `useFileBlob`,
 * which downloaded every byte before pdfjs even started parsing. On a
 * 50-page document over a slow connection that means the user stares
 * at a spinner for the entire transfer. Range mode paints page 1 as
 * soon as pdfjs has the table + first page's stream (typically a few
 * hundred KB regardless of total file size).
 *
 * For warm caches the blob-cache Service Worker (`public/blob-sw.js`)
 * intercepts the Range fetches and answers them with 206 Partial
 * Content from IndexedDB — so previously-opened PDFs paint
 * essentially instantly without re-hitting the network.
 *
 * NOTE: this file is dynamically imported by FilePreview (see
 * ../FilePreview.tsx). Non-PDF previews never pay the react-pdf bundle
 * cost.
 */

"use client";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files/redux/selectors";
import { usePdfRemoteSource } from "@/features/files/hooks/usePdfRemoteSource";
import { isAuthenticatedFileBytesUrl } from "@/features/files/handler/utils/python-base";
import PdfDocumentRenderer from "./PdfDocumentRenderer";
import PdfSourceUnavailable from "./PdfSourceUnavailable";

export interface PdfPreviewProps {
  fileId: string;
  className?: string;
  /**
   * Already-resolved URL for these bytes. A PUBLIC one (CDN, blob:, share)
   * lets PDF.js begin range loading on the first render while the hook still
   * owns refresh/retry. A durable private `/files/{id}/download` URL is never
   * handed to PDF.js on its own: it waits for the hook's auth (headers +
   * file-session cookie), because sent bare it answers 401 — the "Unexpected
   * server response (401) while retrieving PDF" page crash (2026-09-26).
   */
  remoteUrl?: string | null;
  /**
   * Optional controlled page number. When set, the viewer renders this
   * page and emits changes via `onPageChange`. Use this to drive scroll
   * sync from a parent (e.g. the PDF Studio's text panes).
   */
  pageNumber?: number;
  onPageChange?: (page: number) => void;
  /** Human label used by navigation affordances. Defaults to "page". */
  pageLabel?: string;
  /** Large translucent previous/next controls over the document canvas. */
  floatingPageControls?: boolean;
  /**
   * Optional render-slot for the overlay mounted on top of the rendered
   * page (annotation rectangles, search highlights, etc.). Receives
   * geometry the overlay needs to translate PDF user-space points into
   * canvas pixels. Pass-through to `PdfDocumentRenderer.renderOverlay`.
   */
  renderOverlay?: (info: {
    pageNumber: number;
    pageWidthPt: number;
    pageHeightPt: number;
    rotation: number;
  }) => React.ReactNode;
  /** Pass-through to `PdfDocumentRenderer.layout` ("continuous": every page, the caller scrolls). */
  layout?: "paged" | "continuous";
  continuousZoom?: number;
  maxPageWidth?: number;
  onDocumentLoad?: (numPages: number) => void;
  onPageRendered?: (pageNumber: number) => void;
}

export default function PdfPreview({
  fileId,
  className,
  remoteUrl: providedRemoteUrl,
  pageNumber,
  onPageChange,
  pageLabel,
  floatingPageControls,
  renderOverlay,
  layout = "paged",
  continuousZoom,
  maxPageWidth,
  onDocumentLoad,
  onPageRendered,
}: PdfPreviewProps) {
  const {
    remoteUrl,
    headers,
    withCredentials,
    loading: sessionLoading,
    error: sessionError,
    sourceMissing,
    bytesLoaded,
    bytesTotal,
    retry,
  } = usePdfRemoteSource(fileId);
  const file = useAppSelector((s) =>
    fileId ? selectFileById(s, fileId) : null,
  );

  // The bytes PDF.js may read right now, and with which credentials. The
  // hook's URL arrives only once its auth is ready, so it always carries it.
  // A caller's URL is used alone only when it needs no auth.
  const providedIsPublic =
    !!providedRemoteUrl && !isAuthenticatedFileBytesUrl(providedRemoteUrl);
  const useHookSource = !!remoteUrl || !providedIsPublic;

  if (sourceMissing && !providedIsPublic) {
    return (
      <div className={cn("relative h-full w-full", className)}>
        <PdfSourceUnavailable fileName={file?.fileName ?? null} />
      </div>
    );
  }

  const continuous = layout === "continuous";
  return (
    <div className={cn(continuous ? "relative w-full" : "relative h-full w-full", className)}>
      <PdfDocumentRenderer
        remoteUrl={useHookSource ? remoteUrl : providedRemoteUrl}
        remoteHeaders={useHookSource ? headers : undefined}
        withCredentials={useHookSource && withCredentials}
        fileName={file?.fileName ?? null}
        loading={useHookSource && sessionLoading}
        error={useHookSource ? sessionError : null}
        onRetry={retry}
        bytesLoaded={bytesLoaded}
        bytesTotal={bytesTotal}
        pageNumber={pageNumber}
        onPageChange={onPageChange}
        pageLabel={pageLabel}
        floatingPageControls={floatingPageControls}
        renderOverlay={renderOverlay}
        layout={layout}
        continuousZoom={continuousZoom}
        maxPageWidth={maxPageWidth}
        onDocumentLoad={onDocumentLoad}
        onPageRendered={onPageRendered}
        className={continuous ? "w-full" : "h-full w-full"}
      />
    </div>
  );
}
