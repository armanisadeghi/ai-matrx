/**
 * features/page-extraction/components/ChunksTab.tsx
 *
 * The "Chunks" tab inside the Extractions pane. Visualizes the computed
 * chunks based on the user's draft config — like the AI-cleaned reader
 * pane shows per-page cards, this shows per-chunk cards.
 *
 *   ┌────────────────────────────────────────────────────────┐
 *   │ 5 chunks · 60 pages · 312k chars                       │
 *   │ avg 62k · longest 88k · shortest 41k · 0 empty         │
 *   ├────────────────────────────────────────────────────────┤
 *   │  chunk 1 — pages 1-12 · 47,221 chars         [▶ open]  │
 *   │  chunk 2 — pages 13-24 · 51,008 chars        [▶ open]  │
 *   │  ...                                                   │
 *   └────────────────────────────────────────────────────────┘
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  useChunkPreview,
  type ChunkConfigOverride,
} from "@/features/page-extraction/hooks/useChunkPreview";
import { ChunkCard } from "@/features/page-extraction/components/ChunkCard";
import { getJob } from "@/features/page-extraction/api/jobs";
import { selectActiveRunByJob } from "@/features/page-extraction/redux/selectors";
import { selectViewedJobForFile } from "@/features/page-extraction/redux/selectors";
import { isAllJobsView } from "@/features/page-extraction/redux/pageExtractionSlice";
import type {
  PageExtractionJob,
  SourceVariationKind,
} from "@/features/page-extraction/types";

export interface ChunksTabProps {
  fileId: string;
  processedDocumentId: string | null;
  onJumpToPage?: (page: number) => void;
}

export function ChunksTab({
  fileId,
  processedDocumentId,
  onJumpToPage,
}: ChunksTabProps) {
  // Chunks are inherently per-template (each Job has its own
  // page-range + chunk-size + overlap). The "All extractions" view in
  // the main pane is aggregate-only; there's no sensible chunk
  // preview for it. Show a hint instead of trying to render something
  // ambiguous.
  const viewedJobId = useAppSelector((s) => selectViewedJobForFile(s, fileId));
  const inAllView = isAllJobsView(viewedJobId);

  // When a saved job is being viewed, compute the chunk preview from that
  // job's persisted config rather than the live inspector draft. The draft
  // is empty after a page reload (and is only hydrated by the inspector form,
  // which may not be mounted), so without this the Chunks tab would show
  // "No chunks yet" for a job that has clearly run. Loading the job here makes
  // the tab self-sufficient.
  const [job, setJob] = useState<PageExtractionJob | null>(null);
  const [jobLoading, setJobLoading] = useState(false);
  useEffect(() => {
    if (inAllView || !viewedJobId) {
      setJob(null);
      return;
    }
    let cancelled = false;
    setJobLoading(true);
    void getJob(viewedJobId)
      .then((j) => {
        if (!cancelled) setJob(j);
      })
      .finally(() => {
        if (!cancelled) setJobLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inAllView, viewedJobId]);

  const configOverride = useMemo<ChunkConfigOverride | null>(() => {
    if (!job) return null;
    return {
      scopePages: job.scope_pages ?? [],
      chunkSize: job.chunk_size,
      chunkOverlap: job.chunk_overlap,
      sourceVariations: (job.source_variations ?? [
        "clean_text",
      ]) as SourceVariationKind[],
    };
  }, [job]);

  const {
    chunks,
    stats,
    loading: chunksLoading,
    error,
  } = useChunkPreview({
    fileId,
    processedDocumentId,
    configOverride,
  });

  // While the viewed job's config is still loading we don't yet know its
  // chunking, so treat that as loading to avoid a flash of "No chunks yet".
  const loading = chunksLoading || (!!viewedJobId && !inAllView && jobLoading);

  // Overlay per-chunk status for the run associated with whichever Job
  // is currently being viewed in this pane (`viewedJobByFile`, falling
  // back to the sidebar's selection). Using the viewed-Job lets the
  // user watch progress of a different template's run without forcing
  // the sidebar to follow. In All-view, viewedJobId is the sentinel
  // (not a real job id) so selectActiveRunByJob returns null — the
  // overlay quietly stays off.
  const activeRun = useAppSelector((s) =>
    selectActiveRunByJob(s, inAllView ? null : viewedJobId),
  );
  const pageRunByChunkIndex = useMemo(() => {
    if (!activeRun)
      return new Map<
        number,
        NonNullable<(typeof activeRun)["pageRuns"]>[string]
      >();
    return new Map(
      Object.values(activeRun.pageRuns).map((pr) => [pr.chunkIndex, pr]),
    );
  }, [activeRun]);

  if (inAllView) {
    return (
      <div className="p-4 text-[11px] text-muted-foreground leading-snug">
        Chunks are configured per template. Pick a specific template from the
        View dropdown to see how its pages were chunked.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 text-[11px] text-muted-foreground">
        Loading page text…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4 text-[11px] text-destructive">
        Couldn't load pages: {error}
      </div>
    );
  }
  if (chunks.length === 0) {
    return (
      <div className="p-4 text-[11px] text-muted-foreground leading-snug">
        No chunks yet. Configure pages, chunk size, and source variations in the
        inspector. Chunks will appear here live as you type.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Stats strip */}
      <div className="shrink-0 px-3 py-2 border-b border-border bg-card/40 text-[10px] text-muted-foreground">
        <div className="font-medium text-foreground/80">
          {stats.chunkCount} chunk{stats.chunkCount === 1 ? "" : "s"} ·{" "}
          {stats.totalChars.toLocaleString()} chars total
        </div>
        <div className="text-[9px]">
          avg{" "}
          <span className="font-mono text-foreground/80">
            {stats.avgChars.toLocaleString()}
          </span>{" "}
          · longest{" "}
          <span className="font-mono text-foreground/80">
            {stats.longestChars.toLocaleString()}
          </span>{" "}
          · shortest{" "}
          <span className="font-mono text-foreground/80">
            {stats.shortestChars.toLocaleString()}
          </span>
          {stats.emptyChunks > 0 && (
            <>
              {" "}
              ·{" "}
              <span className="text-amber-700 dark:text-amber-400">
                {stats.emptyChunks} empty
              </span>
            </>
          )}
        </div>
      </div>

      {/* Chunk list */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
        {chunks.map((chunk) => (
          <ChunkCard
            key={chunk.chunkIndex}
            chunk={chunk}
            pageRun={pageRunByChunkIndex.get(chunk.chunkIndex)}
            onJumpToPage={onJumpToPage}
          />
        ))}
      </div>
    </div>
  );
}
