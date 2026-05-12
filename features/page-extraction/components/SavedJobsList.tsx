/**
 * features/page-extraction/components/SavedJobsList.tsx
 *
 * Lists the user's saved Templates (Jobs with is_saved=true and not
 * archived) for the current file. Each row carries three icons:
 *
 *   ✎ Edit   — load this template into the form for editing
 *   🗑 Delete — soft-delete (archive) the template. Does NOT delete the
 *               extraction data this template has produced.
 *   ▶ Play   — kick a fresh Run against the template with its current
 *               config.
 *
 * Soft-deletion sets `archived_at` so the row is hidden from listings
 * but the results stay queryable. Permanent deletion is intentionally
 * not exposed in the UI — the data the template produced should outlive
 * the template itself.
 */

"use client";

import { useState } from "react";
import { Loader2, Play, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useToastManager } from "@/hooks/useToastManager";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useExtractionJobs } from "@/features/page-extraction/hooks/useExtractionJobs";
import { useExtractionStream } from "@/features/page-extraction/hooks/useExtractionStream";
import { deleteJob } from "@/features/page-extraction/api/jobs";
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
  const { jobs, loading, refetch } = useExtractionJobs(fileId);
  const dispatch = useAppDispatch();
  const toast = useToastManager("page-extraction");
  const { running, start } = useExtractionStream();
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);

  if (!fileId) return null;
  if (loading && jobs.length === 0) return null;
  if (jobs.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground/70 leading-snug px-1">
        No saved templates yet. Configure below, tick{" "}
        <span className="font-medium">Save as named Job</span>, and run.
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

  const handleEdit = (job: PageExtractionJob) => {
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

  const handleDelete = async (job: PageExtractionJob) => {
    const ok = await confirm({
      title: "Delete template",
      description: (
        <>
          Delete <b>{job.name}</b>? The template will be removed from this
          list. <span className="font-medium">Extracted data stays</span>{" "}
          — clear it separately from the Results tab.
        </>
      ),
      confirmLabel: "Delete template",
      variant: "destructive",
    });
    if (!ok) return;
    setDeletingJobId(job.id);
    try {
      await deleteJob(job.id);
      refetch();
      toast.success(`Deleted "${job.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingJobId(null);
    }
  };

  return (
    <div className="space-y-1.5 border-b border-border pb-3">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Saved templates ({jobs.length})
      </p>
      <ul className="space-y-1">
        {jobs.map((job) => (
          <li
            key={job.id}
            className="flex items-center gap-1 px-2 py-1.5 bg-card border border-border rounded-md text-[11px]"
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

            {/* Three-icon row: edit, delete, play */}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 shrink-0"
              title="Load into form"
              onClick={() => handleEdit(job)}
            >
              <Pencil className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
              title="Delete template (data stays)"
              disabled={deletingJobId === job.id}
              onClick={() => void handleDelete(job)}
            >
              {deletingJobId === job.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
            </Button>
            <Button
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
              title="Run a new instance with this template's config"
              disabled={running || runningJobId === job.id}
              onClick={() => void handleRunAgain(job)}
            >
              {runningJobId === job.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
