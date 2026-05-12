/**
 * features/page-extraction/components/SavedJobsList.tsx
 *
 * Lists the user's saved Jobs for the current file and lets them either:
 *   1. Run again — kicks a new run against the existing Job (no draft edits)
 *   2. Load into form — hydrates the in-memory draft from the Job's config
 *      so the user can tweak before running
 *
 * "Saved" is per the Job's `is_saved` column — ad-hoc Jobs created from
 * the Run form (without "Save as named Job" ticked) are filtered out.
 */

"use client";

import { useState } from "react";
import { Loader2, Play, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useToastManager } from "@/hooks/useToastManager";
import { useExtractionJobs } from "@/features/page-extraction/hooks/useExtractionJobs";
import { useExtractionStream } from "@/features/page-extraction/hooks/useExtractionStream";
import {
  patchDraft,
  selectJobForFile,
} from "@/features/page-extraction/redux/pageExtractionSlice";
import type {
  PageExtractionJob,
  SourceVariationKind,
  ChunkingStrategy,
} from "@/features/page-extraction/types";
import { formatPageRange } from "@/features/page-extraction/utils/chunk-preview";

export function SavedJobsList({ fileId }: { fileId: string }) {
  const { jobs, loading } = useExtractionJobs(fileId);
  const dispatch = useAppDispatch();
  const toast = useToastManager("page-extraction");
  const { running, start } = useExtractionStream();
  const [runningJobId, setRunningJobId] = useState<string | null>(null);

  if (!fileId) return null;
  if (loading && jobs.length === 0) return null;
  if (jobs.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground/70 leading-snug px-1">
        No saved Jobs yet for this file. Configure below, tick{" "}
        <span className="font-medium">Save as named Job</span>, and Run.
      </p>
    );
  }

  const handleRunAgain = async (job: PageExtractionJob) => {
    dispatch(selectJobForFile({ fileId, jobId: job.id }));
    setRunningJobId(job.id);
    try {
      await start(fileId, { job_id: job.id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunningJobId(null);
    }
  };

  const handleLoad = (job: PageExtractionJob) => {
    dispatch(selectJobForFile({ fileId, jobId: job.id }));
    dispatch(
      patchDraft({
        fileId,
        patch: {
          agentId: job.agent_id,
          scopePages: job.scope_pages ?? [],
          scopePagesInputRaw: job.scope_pages?.length
            ? formatPageRange(job.scope_pages)
            : "",
          chunkSize: job.chunk_size,
          chunkOverlap: job.chunk_overlap,
          sourceVariations: (job.source_variations ??
            ["clean_text"]) as SourceVariationKind[],
          chunkingStrategy: (job.chunking_strategy ?? "pages") as ChunkingStrategy,
          jobName: job.name,
          saveAsJob: true,
          variableMapping: job.variable_mapping ?? {},
          outputSchema: job.output_schema as unknown,
          maxConcurrent: job.max_concurrent,
        },
      }),
    );
    toast.success(`Loaded "${job.name}" into the form`);
  };

  return (
    <div className="space-y-1.5 border-b border-border pb-3">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Saved Jobs ({jobs.length})
      </p>
      <ul className="space-y-1">
        {jobs.map((job) => (
          <li
            key={job.id}
            className="flex items-center gap-1.5 px-2 py-1.5 bg-card border border-border rounded-md text-[11px]"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{job.name}</p>
              <p className="text-[10px] text-muted-foreground tabular-nums">
                chunk {job.chunk_size} ·{" "}
                {job.source_variations?.length ?? 1} src ·{" "}
                {job.scope_pages?.length
                  ? `${job.scope_pages.length} pages`
                  : "all pages"}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 shrink-0"
              title="Load into form"
              onClick={() => handleLoad(job)}
            >
              <Pencil className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              className="h-6 px-2 text-[10px] shrink-0"
              disabled={running || runningJobId === job.id}
              onClick={() => void handleRunAgain(job)}
              title="Run a new instance of this Job with the same config"
            >
              {runningJobId === job.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <>
                  <Play className="w-3 h-3 mr-0.5" />
                  Run
                </>
              )}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
