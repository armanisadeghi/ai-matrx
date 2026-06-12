"use client";

/**
 * 4-pane synchronized document viewer.
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ Document title + lineage breadcrumbs                      │
 *   ├──────────┬──────────┬──────────┬──────────────────────────┤
 *   │ PDF      │ Raw text │ Cleaned  │ Chunks                   │
 *   │ pages    │          │ markdown │ (filterable + virtualised)│
 *   └──────────┴──────────┴──────────┴──────────────────────────┘
 *
 * Driven by a single source of truth: ``activePageIndex``. Changing the
 * active page (via PDF nav, raw-text scroll, or chunk-pane click)
 * updates the other three panes in lockstep.
 *
 * Data fetching:
 *   - The detail + lineage + chunks all fire in parallel from the
 *     parent route page (no waterfalls).
 *   - The per-page query is the only one that re-fires on page change,
 *     and it includes blocks/words ONLY when the user has the overlay
 *     on (default off — the bytes are heavy on dense pages).
 *
 * Bundle: react-pdf + react-markdown are both lazy via next/dynamic.
 */

import { useCallback, useState } from "react";
import { Database, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { DataStoreBindPanel } from "@/features/rag/components/data-stores/DataStoreBindPanel";
import { ChunksPane } from "@/features/rag/components/documents/panes/ChunksPane";
import { CleanedMarkdownPane } from "@/features/rag/components/documents/panes/CleanedMarkdownPane";
import { PdfPane } from "@/features/rag/components/documents/panes/PdfPane";
import { RawTextPane } from "@/features/rag/components/documents/panes/RawTextPane";
import { LineageBreadcrumbs } from "@/features/rag/components/documents/LineageBreadcrumbs";
import {
  useDocument,
  useDocumentChunks,
  useDocumentLineage,
  useDocumentPage,
} from "@/features/rag/hooks/useDocument";
import type { ChunkRow } from "@/features/rag/types/documents";

export interface DocumentViewerProps {
  documentId: string;
  /** Optional initial page (1-based — citation deep-links use 1-based). */
  initialPage?: number;
  /** Optional chunk to highlight on first render. */
  initialChunkId?: string;
  /** Called when the user clicks a lineage chip. */
  onOpenAncestor?: (
    id: string,
    kind: "cld_files" | "processed_document",
  ) => void;
}

export function DocumentViewer({
  documentId,
  initialPage,
  initialChunkId,
  onOpenAncestor,
}: DocumentViewerProps) {
  const [activePageIndex, setActivePageIndex] = useState<number>(
    initialPage ? Math.max(0, initialPage - 1) : 0,
  );
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(
    initialChunkId ?? null,
  );

  // Parallel fetches — keep these as separate hooks; React batches the
  // useState that backs each one.
  const doc = useDocument(documentId);
  const lineage = useDocumentLineage(documentId);
  const chunks = useDocumentChunks(documentId, { limit: 2000 });
  const page = useDocumentPage(documentId, activePageIndex, {
    includeBlocks: false,
    includeWords: false,
  });

  const handleChunkSelect = useCallback((c: ChunkRow) => {
    setSelectedChunkId(c.chunk_id);
    // Jump the PDF/page to the chunk's first page when known.
    if (c.page_numbers && c.page_numbers.length > 0) {
      const firstPage = c.page_numbers[0]!;
      setActivePageIndex(Math.max(0, firstPage - 1));
    }
  }, []);

  const totalPages = doc.data?.total_pages ?? doc.data?.pages.length ?? 0;

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-sm font-semibold truncate">
            {doc.data?.name ?? "Loading…"}
          </h1>
          {doc.data && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {doc.data.derivation_kind} · {totalPages || 0} pages ·{" "}
              {doc.data.chunk_count} chunks
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <LineageBreadcrumbs
            document={doc.data}
            lineage={lineage.data}
            onOpenAncestor={onOpenAncestor}
          />
          {doc.data && (
            <BindButton documentId={doc.data.id} documentName={doc.data.name} />
          )}
          <PageNav
            current={activePageIndex}
            total={totalPages}
            onChange={setActivePageIndex}
          />
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize={32} minSize={20}>
            <PdfPane
              document={doc.data}
              activePageIndex={activePageIndex}
              onActivePageChange={setActivePageIndex}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={20} minSize={12}>
            <RawTextPane
              page={page.data}
              loading={page.loading}
              error={page.error}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={24} minSize={14}>
            <CleanedMarkdownPane
              page={page.data}
              loading={page.loading}
              error={page.error}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={24} minSize={14}>
            <ChunksPane
              chunks={chunks.data ?? []}
              loading={chunks.loading}
              error={chunks.error}
              activePageNumber={activePageIndex + 1}
              selectedChunkId={selectedChunkId}
              onSelect={handleChunkSelect}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

function BindButton({
  documentId,
  documentName,
}: {
  documentId: string;
  documentName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
          <Database className="h-3.5 w-3.5" />
          Data stores
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b">
          <DialogTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4" />
            Bind document to data stores
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[70dvh] overflow-y-auto">
          <DataStoreBindPanel
            processedDocumentId={documentId}
            documentName={documentName}
          />
        </div>
        <div className="px-4 py-2 border-t text-[10px] text-muted-foreground flex items-center justify-between">
          <span>
            Manage all stores at{" "}
            <a
              href="/rag/data-stores"
              target="_blank"
              rel="noreferrer"
              className="underline inline-flex items-center gap-0.5 hover:text-foreground"
            >
              /rag/data-stores
              <ExternalLink className="h-3 w-3" />
            </a>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PageNav({
  current,
  total,
  onChange,
}: {
  current: number;
  total: number;
  onChange: (next: number) => void;
}) {
  if (total <= 0) return null;
  const safeNext = (delta: number) =>
    onChange(Math.max(0, Math.min(total - 1, current + delta)));
  return (
    <div className="flex items-center gap-1 text-xs">
      <button
        onClick={() => safeNext(-1)}
        disabled={current <= 0}
        className="px-2 py-1 rounded border border-border hover:bg-secondary/40 disabled:opacity-50"
      >
        ‹
      </button>
      <span className="px-2 text-muted-foreground tabular-nums">
        {current + 1} / {total}
      </span>
      <button
        onClick={() => safeNext(1)}
        disabled={current >= total - 1}
        className="px-2 py-1 rounded border border-border hover:bg-secondary/40 disabled:opacity-50"
      >
        ›
      </button>
    </div>
  );
}
