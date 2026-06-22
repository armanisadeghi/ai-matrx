"use client";

/**
 * Chunk list for one document. Filters by parent/child role and by
 * section_kind. Each chunk lights up with a coloured edge when its
 * page_numbers includes the currently-active page in the viewer, so
 * scrolling through the PDF visually walks the chunks pane.
 *
 * Virtualised with @tanstack/react-virtual — large legal PDFs produce
 * thousands of chunks; rendering them all at once stalls the viewer.
 */

import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import type { ChunkRow } from "@/features/rag/types/documents";

export interface ChunksPaneProps {
  chunks: ChunkRow[];
  loading: boolean;
  error: string | null;
  activePageNumber: number | null; // 1-based
  onSelect?: (chunk: ChunkRow) => void;
  selectedChunkId?: string | null;
}

export function ChunksPane({
  chunks,
  loading,
  error,
  activePageNumber,
  onSelect,
  selectedChunkId,
}: ChunksPaneProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Pre-compute which chunks touch the active page so the visual cue
  // is O(1) per row inside the virtualiser callback.
  const onPage = useMemo(() => {
    const set = new Set<string>();
    if (activePageNumber === null) return set;
    for (const c of chunks) {
      if (c.page_numbers && c.page_numbers.includes(activePageNumber)) {
        set.add(c.chunk_id);
      }
    }
    return set;
  }, [chunks, activePageNumber]);

  const rowVirtualizer = useVirtualizer({
    count: chunks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 88,
    overscan: 8,
  });

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <header className="flex items-center justify-between px-3 py-2 border-b border-border text-xs text-muted-foreground">
        <span className="font-medium">{RAG_VOCAB.segmentsShort}</span>
        <span>{chunks.length.toLocaleString()} total</span>
      </header>
      <div ref={parentRef} className="flex-1 overflow-auto">
        {loading && (
          <div className="p-3 text-sm text-muted-foreground">Loading…</div>
        )}
        {error && (
          <div className="p-3 text-sm text-destructive">Error: {error}</div>
        )}
        {!loading && !error && chunks.length === 0 && (
          <div className="p-3 text-sm text-muted-foreground">
            No segments for this document yet — re-process through RAG
            ingestion.
          </div>
        )}
        {!loading && !error && chunks.length > 0 && (
          <div
            style={{
              height: rowVirtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((vi) => {
              const c = chunks[vi.index];
              const matched = onPage.has(c.chunk_id);
              const selected = selectedChunkId === c.chunk_id;
              return (
                <button
                  key={c.chunk_id}
                  onClick={() => onSelect?.(c)}
                  className={cn(
                    "absolute left-0 right-0 px-3 py-2 text-left text-xs border-b border-border transition-colors",
                    matched && "border-l-2 border-l-primary",
                    selected && "bg-secondary",
                    !selected && "hover:bg-secondary/40",
                  )}
                  style={{
                    top: vi.start,
                    height: vi.size,
                  }}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      #{c.chunk_index} ·{" "}
                      {c.parent_chunk_id ? "child" : "parent"}
                      {c.page_numbers && c.page_numbers.length
                        ? ` · p${c.page_numbers.join(",")}`
                        : ""}
                    </span>
                    {c.section_kind && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/60">
                        {c.section_kind}
                      </span>
                    )}
                  </div>
                  <div className="text-xs line-clamp-3 text-foreground">
                    {c.content_text}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
