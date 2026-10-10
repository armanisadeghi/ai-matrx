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
import type { PdfPreviewProps } from "@/features/pdf/components/viewer/PdfPreview";
import { useMemo } from "react";
import type { DocumentDetail } from "@/features/rag/types/documents";
import { pageImageUrl } from "@/features/rag/api/document";
import { PdfSurfaceSwitcher } from "@/features/pdf/components/PdfSurfaceSwitcher";
// Deep import, NOT the `@/features/files` barrel. The barrel re-exports PreviewPane,
// which reaches DocumentViewer -> this file; importing the barrel back from here
// welded all ~440 barrel modules into one strongly-connected component, so tree
// shaking could not drop anything and all ~82 InlineMediaRef consumers compiled the
// Knowledge library and PDF viewer. Breaking this edge breaks the cycle.
import { InlineMediaRef } from "@ai-matrx/media/react";

// Heavy: react-pdf + pdfjs-dist. The canonical viewer, deep-imported.
const PdfPreview = dynamic<PdfPreviewProps>(
  () => import("@/features/pdf/components/viewer/PdfPreview"),
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
        <header className="px-3 py-2 border-b border-border type-secondary text-muted-foreground font-medium">
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
      <div className="flex h-full items-center justify-center type-body text-muted-foreground">
        No document
      </div>
    );
  }

  if (fallback) return fallback;

  // cld_file source — the canonical viewer, page-synced with the other
  // panes (activePageIndex is 0-based; the viewer is 1-based). The surface
  // switcher docks INTO the viewer's toolbar row — it used to float
  // absolutely over the row's right end, covering the pager.
  return (
    <div className="relative flex flex-col h-full overflow-hidden bg-background">
      <PdfPreview
        fileId={document.source_id}
        pageNumber={activePageIndex + 1}
        onPageChange={(page) => onActivePageChange(page - 1)}
        toolbarEnd={
          <PdfSurfaceSwitcher
            current="rag-library"
            fileId={document.source_id}
            size="icon"
          />
        }
      />
    </div>
  );
}
