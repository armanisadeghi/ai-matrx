"use client";

/**
 * BinaryFilePdfPreview — code-editor binary-file PDF preview.
 *
 * Thin adapter over the CANONICAL viewer (features/pdf PdfDocumentRenderer)
 * for the editor's already-downloaded blob. Converged 2026-06-12: this file
 * previously re-implemented its own react-pdf shell (own zoom/fit), which
 * violated the one-implementation-per-purpose rule and drifted from the
 * canonical viewer's features (loading state, retry, rotation).
 */

import dynamic from "next/dynamic";
import { PdfLoadingState } from "@/features/pdf/components/viewer/PdfLoadingState";

const PdfDocumentRenderer = dynamic(
  () => import("@/features/pdf/components/viewer/PdfDocumentRenderer"),
  { ssr: false, loading: () => <PdfLoadingState /> },
);

export interface BinaryFilePdfPreviewProps {
  /** Same-origin blob containing the PDF bytes. Owned by the parent. */
  blob: Blob;
  /** `blob:` URL pinned to that Blob (parent-owned lifecycle). */
  url: string | null;
  fileName?: string | null;
  className?: string;
}

export function BinaryFilePdfPreview({
  url,
  fileName,
  className,
}: BinaryFilePdfPreviewProps) {
  if (!url) {
    return <PdfLoadingState fileName={fileName ?? null} className={className} />;
  }
  return (
    <PdfDocumentRenderer
      blobUrl={url}
      fileName={fileName ?? undefined}
      className={className}
    />
  );
}
