"use client";

/**
 * PDF render pane (left-most). When the document's source_kind='cld_file'
 * we point the existing PdfPreview at the source cld_files row by id —
 * it handles the blob fetch + react-pdf rendering for us.
 *
 * For non-cld_file source_kinds (legacy / inline / external_url) we
 * fall back to the rendered page-image endpoint, which delivers a PNG
 * from the cld-cached page-image cache. Lower fidelity than react-pdf
 * (no text layer) but works for any source.
 */

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { useMemo } from "react";
import type { DocumentDetail } from "@/features/rag/types/documents";
import { pageImageUrl } from "@/features/rag/api/document";
import { InlineMediaRef } from "@/features/files";

interface PdfPreviewProps {
  fileId: string;
  className?: string;
}

// Heavy: react-pdf + pdfjs-dist. Same import shape as the file viewer.
const PdfPreview = dynamic<PdfPreviewProps>(
  () =>
    import("@/features/files/components/core/FilePreview/previewers/PdfPreview"),
  { ssr: false },
) as ComponentType<PdfPreviewProps>;

export interface PdfPaneProps {
  document: DocumentDetail | null;
  activePageIndex: number;
  onActivePageChange: (pageIndex: number) => void;
}

export function PdfPane({
  document,
  activePageIndex,
  onActivePageChange,
}: PdfPaneProps) {
  // When the document is anchored to a cld_files row we get full
  // react-pdf rendering. Otherwise we degrade to the per-page PNG.
  const fallback = useMemo(() => {
    if (!document) return null;
    if (document.source_kind === "cld_file") return null;
    return (
      <div className="flex flex-col h-full overflow-hidden bg-background">
        <header className="px-3 py-2 border-b border-border text-xs text-muted-foreground font-medium">
          Page {activePageIndex + 1}
        </header>
        <div className="flex-1 overflow-auto p-3 grid place-items-center">
          <InlineMediaRef
            ref={pageImageUrl(document.id, activePageIndex)}
            alt={`Page ${activePageIndex + 1}`}
            size="fill"
            fit="contain"
            rounded="sm"
            className="max-w-full h-auto shadow-sm"
          />
        </div>
      </div>
    );
  }, [document, activePageIndex]);

  if (!document) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No document
      </div>
    );
  }

  if (fallback) return fallback;

  // cld_file source — use the rich PdfPreview as a passive renderer.
  // Today PdfPreview only accepts (fileId, className); two-way page
  // sync between this pane and the others is wired through the page-
  // image fallback path or via PageNav in the viewer header. A future
  // change to PdfPreview can expose currentPage / onPageChange to make
  // the PDF pane drive the active page directly. For now, we silence
  // unused-prop linting via the void.
  void onActivePageChange;
  void activePageIndex;
  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <PdfPreview fileId={document.source_id} />
    </div>
  );
}
