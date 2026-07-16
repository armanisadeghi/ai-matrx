"use client";

/**
 * Drawer body for `processed_document` attachments — the "Smart Canvas
 * Controller" for a RAG document. Clicking an attached-document chip opens THIS
 * body, which composes the canonical `LibraryPreviewPage` (the pages / cleaned /
 * raw / chunks + in-document search surface) keyed by the document's
 * `processed_document_id`. No bespoke viewer — the same component the
 * `/rag/library/[id]/preview` route renders, in `embedded` mode so it drops its
 * own header chrome and fills the drawer.
 *
 * `LibraryPreviewPage` is heavy (page renderer, search, resizable panels,
 * knowledge-asset builder), so it's split behind `next/dynamic({ ssr:false })`
 * and only fetched once this body actually renders — i.e. when the user opens
 * the drawer on a document chip (Method A: conditional reveal).
 */

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { FileText, Loader2 } from "lucide-react";
import type { ContextItemBodyProps } from "../types";
import { useAttachedDocumentDisplayName } from "@/features/agents/components/inputs/resources/attached-documents";

const LibraryPreviewPage = dynamic(
  () =>
    import("@/features/rag/components/library/LibraryPreviewPage").then(
      (m) => m.LibraryPreviewPage,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading document…
      </div>
    ),
  },
);

export function ProcessedDocumentBody({
  item,
  setTitle,
  searchSubmission,
}: ContextItemBodyProps) {
  const documentId =
    item.refs.processedDocumentId ?? item.refs.documentIds?.[0] ?? null;
  const displayName = useAttachedDocumentDisplayName(
    item.refs.fileId,
    item.title,
  );

  useEffect(() => {
    setTitle?.(displayName);
  }, [displayName, setTitle]);

  if (!documentId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
        <FileText className="h-8 w-8" />
        <p className="text-sm">
          This document can’t be opened — its identifier is missing.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0">
      {/* Search lives in the drawer's title pill (ProcessedDocumentTitle) —
          submissions arrive via `searchSubmission`, so the internal bar is
          dropped to keep the body full-height. */}
      <LibraryPreviewPage
        documentId={documentId}
        embedded
        hideSearchBar
        externalSearch={searchSubmission}
      />
    </div>
  );
}
