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
import PdfDocumentRenderer from "./PdfDocumentRenderer";
import PdfSourceUnavailable from "./PdfSourceUnavailable";

export interface PdfPreviewProps {
  fileId: string;
  className?: string;
  /**
   * Optional controlled page number. When set, the viewer renders this
   * page and emits changes via `onPageChange`. Use this to drive scroll
   * sync from a parent (e.g. the PDF Studio's text panes).
   */
  pageNumber?: number;
  onPageChange?: (page: number) => void;
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
}

export default function PdfPreview({
  fileId,
  className,
  pageNumber,
  onPageChange,
  renderOverlay,
}: PdfPreviewProps) {
  const {
    remoteUrl,
    headers,
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

  if (sourceMissing) {
    return (
      <div className={cn("relative h-full w-full", className)}>
        <PdfSourceUnavailable fileName={file?.fileName ?? null} />
      </div>
    );
  }

  return (
    <div className={cn("relative h-full w-full", className)}>
      <PdfDocumentRenderer
        remoteUrl={remoteUrl}
        remoteHeaders={headers}
        fileName={file?.fileName ?? null}
        loading={sessionLoading}
        error={sessionError}
        onRetry={retry}
        bytesLoaded={bytesLoaded}
        bytesTotal={bytesTotal}
        pageNumber={pageNumber}
        onPageChange={onPageChange}
        renderOverlay={renderOverlay}
        className="h-full w-full"
      />
    </div>
  );
}
