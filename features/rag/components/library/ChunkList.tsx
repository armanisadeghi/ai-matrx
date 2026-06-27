"use client";

/**
 * ChunkList — the canonical chunk renderer for the RAG library.
 *
 * One card per chunk: kind / index / token badges + embedding status + the
 * actual content_text, with page numbers surfaced prominently (the "where").
 * Extracted from LibraryPreviewPage so the same renderer powers BOTH the
 * preview's per-page chunk panel AND the Knowledge Asset Builder's result
 * view (showing the rows/captions/summaries a derivation actually produced).
 *
 * Two loaders ship here so callers never reimplement fetch+state:
 *   - <ChunksOnPage>        — chunks for one page of a document
 *   - <DerivativeChunkList> — chunks of a derivation set (its own doc id)
 *
 * Both render the shared <ChunkCard>. The card takes a structurally-typed
 * chunk so any endpoint returning the standard chunk shape can use it.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getJson } from "@/lib/python-client";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import {
  fetchDerivativeChunks,
  type DerivativeChunkRow,
} from "@/features/rag/api/derivations";

/** The structural shape ChunkCard needs. Any endpoint chunk row that carries
 *  these fields renders without adaptation. */
export interface ChunkLike {
  id: string;
  chunk_index: number | null;
  chunk_kind: string | null;
  page_numbers: number[] | null;
  token_count: number | null;
  content_text: string;
  has_oai_embedding: boolean;
  section_kind: string | null;
}

// ---------------------------------------------------------------------------
// Page-number provenance — the "where"
// ---------------------------------------------------------------------------

function formatPages(pages: number[] | null): string | null {
  if (!pages || pages.length === 0) return null;
  const sorted = [...pages].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return first === last ? `p.${first}` : `p.${first}–${last}`;
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function ChunkCard({
  chunk,
  highlighted = false,
}: {
  chunk: ChunkLike;
  /** Mark this as the chunk a citation matched — a primary ring + a "Matched"
   *  badge so the user can tell the retrieved segment from its page siblings. */
  highlighted?: boolean;
}) {
  const pageLabel = formatPages(chunk.page_numbers);
  return (
    <div
      className={cn(
        "rounded-md p-2 space-y-1 bg-card",
        highlighted
          ? "border border-primary/50 ring-1 ring-primary/30 bg-primary/[0.06]"
          : "border border-border",
      )}
    >
      <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
        {highlighted && (
          <Badge
            variant="default"
            className="text-[10px] px-1.5 py-0 font-semibold"
          >
            Matched
          </Badge>
        )}
        {/* Page provenance first — the user's #1 question is "where did this
            come from?", so it leads. */}
        {pageLabel && (
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 font-medium tabular-nums"
          >
            {pageLabel}
          </Badge>
        )}
        <Badge variant="outline" className="text-[10px] px-1 py-0">
          #{chunk.chunk_index ?? "?"}
        </Badge>
        {chunk.chunk_kind && (
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            {chunk.chunk_kind}
          </Badge>
        )}
        {chunk.token_count != null && (
          <Badge variant="outline" className="text-[10px] px-1 py-0">
            {chunk.token_count} tok
          </Badge>
        )}
        {chunk.section_kind && (
          <Badge variant="info" className="text-[10px] px-1 py-0">
            {chunk.section_kind}
          </Badge>
        )}
        {chunk.has_oai_embedding ? (
          <Badge variant="success" className="text-[10px] px-1 py-0">
            embedded
          </Badge>
        ) : (
          <Badge variant="error" className="text-[10px] px-1 py-0">
            no embed
          </Badge>
        )}
      </div>
      <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed font-sans overflow-x-auto">
        {chunk.content_text}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loader: chunks for one page of a document
// ---------------------------------------------------------------------------

interface ApiChunksResponse {
  chunks: ChunkLike[];
  total: number;
}

export function ChunksOnPage({
  documentId,
  pageNumber,
  highlightChunkId = null,
}: {
  documentId: string;
  pageNumber: number;
  /** When set, that chunk floats to the top and renders as the "Matched" card. */
  highlightChunkId?: string | null;
}) {
  const [chunks, setChunks] = useState<ChunkLike[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("limit", "50");
    params.set("page_number", String(pageNumber));
    getJson<ApiChunksResponse>(
      `/rag/library/${documentId}/chunks?${params.toString()}`,
    )
      .then(({ data }) => {
        if (cancelled || !data) return;
        setChunks(Array.isArray(data.chunks) ? data.chunks : []);
        setTotal(typeof data.total === "number" ? data.total : 0);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err?.message ??
              `Failed to load ${RAG_VOCAB.segmentsShort.toLowerCase()}`,
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, pageNumber]);

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-2">
        {loading && <ChunkListSkeleton rows={3} />}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && !error && chunks.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No {RAG_VOCAB.segmentsShort.toLowerCase()} for page {pageNumber}.
          </p>
        )}
        {[...chunks]
          .sort((a, b) => {
            // Float the matched chunk to the top; keep the rest in order.
            if (a.id === highlightChunkId) return -1;
            if (b.id === highlightChunkId) return 1;
            return 0;
          })
          .map((c) => (
            <ChunkCard
              key={c.id}
              chunk={c}
              highlighted={highlightChunkId != null && c.id === highlightChunkId}
            />
          ))}
        {total > chunks.length && (
          <p className="text-xs text-muted-foreground italic">
            Showing first {chunks.length} of {total}.
          </p>
        )}
      </div>
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------
// Loader: chunks of a derivation set (its own document id)
// ---------------------------------------------------------------------------

export function DerivativeChunkList({
  derivativeId,
  expectedTotal,
  limit = 50,
}: {
  derivativeId: string;
  /** The rollup chunk_count, used for the "showing X of Y" footer when the
   *  fetched total agrees. */
  expectedTotal?: number;
  limit?: number;
}) {
  const [rows, setRows] = useState<DerivativeChunkRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetchDerivativeChunks(derivativeId, { limit, signal: ac.signal })
      .then((res) => {
        if (cancelled) return;
        setRows(res.chunks);
        setTotal(res.total);
      })
      .catch((err) => {
        if (cancelled || ac.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load results");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [derivativeId, limit]);

  if (loading) {
    return (
      <div className="space-y-2 p-0.5">
        <ChunkListSkeleton rows={3} />
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-[11px] text-destructive px-0.5 py-1">
        Couldn&apos;t load results: {error}
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground italic px-0.5 py-1">
        No content rows found for this representation.
      </p>
    );
  }

  const shownTotal = total || expectedTotal || rows.length;
  return (
    <div className="space-y-1.5 p-0.5">
      {rows.map((c) => (
        <ChunkCard key={c.id} chunk={c} />
      ))}
      {shownTotal > rows.length && (
        <p className="text-[10px] text-muted-foreground italic">
          Showing first {rows.length} of {shownTotal}.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

export function ChunkListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="border border-border rounded-md p-2 space-y-1.5 bg-card"
        >
          <div className="flex items-center gap-1">
            <Skeleton className="h-3.5 w-10" />
            <Skeleton className="h-3.5 w-8" />
            <Skeleton className="h-3.5 w-14" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      ))}
    </>
  );
}
