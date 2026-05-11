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

// ---------------------------------------------------------------------------
// DEBUG layering visualization — paired with the rings in PreviewPane
// and FilePreview. The PdfPreview component normally has no DOM of its
// own (just delegates to PdfDocumentRenderer), so we add a wrapper div
// here purely to make this layer visible. Rip it out when done.
// ---------------------------------------------------------------------------
const DEBUG_RING_PDF_PREVIEW = "ring-2 ring-inset ring-emerald-500";

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
}

export default function PdfPreview({
  fileId,
  className,
  pageNumber,
  onPageChange,
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
    <div
      className={cn(
        "relative h-full w-full",
        DEBUG_RING_PDF_PREVIEW,
        className,
      )}
    >
      <span className="pointer-events-none absolute left-0 top-0 z-50 select-none rounded-br bg-emerald-500 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white shadow">
        PdfPreview
      </span>
      <PdfDocumentRenderer
        blobUrl={url}
        fileName={file?.fileName ?? null}
        loading={blobLoading}
        bytesLoaded={bytesLoaded}
        bytesTotal={bytesTotal}
        error={blobError}
        pageNumber={pageNumber}
        onPageChange={onPageChange}
        className="h-full w-full"
      />
    </div>
  );
}
