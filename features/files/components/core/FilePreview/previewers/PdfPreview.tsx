/**
 * features/files/components/core/FilePreview/previewers/PdfPreview.tsx
 *
 * Cloud-files PDF previewer. Thin wrapper around the shared
 * `<PdfDocumentRenderer/>` core that handles bytes-fetch via the Python
 * `/files/{id}/download` endpoint.
 *
 * Same-origin blob URL (vs the S3 signed URL) keeps pdfjs's worker
 * fetch CORS-safe regardless of the bucket policy. All toolbar /
 * sizing / pagination / zoom logic lives in `PdfDocumentRenderer` so
 * fixes apply uniformly to every PDF surface in the app (preview pane,
 * pdf-extractor studio, future admin tools).
 *
 * NOTE: this file is dynamically imported by FilePreview (see
 * ../FilePreview.tsx). Non-PDF previews never pay the react-pdf bundle
 * cost.
 */

"use client";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files/redux/selectors";
import { useFileBlob } from "@/features/files/hooks/useFileBlob";
import PdfDocumentRenderer from "./PdfDocumentRenderer";

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
  // Same-origin blob URL via the Python download endpoint — sidesteps
  // S3 CORS that would otherwise 403 a `fetch()` from pdfjs's worker.
  const {
    url,
    loading: blobLoading,
    bytesLoaded,
    bytesTotal,
    error: blobError,
  } = useFileBlob(fileId);
  const file = useAppSelector((s) =>
    fileId ? selectFileById(s, fileId) : null,
  );

  return (
    <div className={cn("relative h-full w-full", className)}>
      <PdfDocumentRenderer
        blobUrl={url}
        fileName={file?.fileName ?? null}
        loading={blobLoading}
        bytesLoaded={bytesLoaded}
        bytesTotal={bytesTotal}
        error={blobError}
        pageNumber={pageNumber}
        onPageChange={onPageChange}
        renderOverlay={renderOverlay}
        className="h-full w-full"
      />
    </div>
  );
}
