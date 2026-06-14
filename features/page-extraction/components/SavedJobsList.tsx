/**
 * features/page-extraction/components/SavedJobsList.tsx
 *
 * The user's saved templates for the current file. Three interactions per
 * row:
 *
 *   • Click the ROW   — select this template (the form to the right
 *                       hydrates from it; the user can view or edit)
 *   • 🗑 trash         — soft-delete this template (data stays)
 *   • ▶ play          — run a new extraction against this template
 *
 * Soft-deletion sets `archived_at` so the template disappears from the
 * picker but the results it produced remain queryable.
 */

"use client";

import { useState } from "react";
import { Loader2, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useToastManager } from "@/hooks/useToastManager";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { cn } from "@/lib/utils";
import {
  removeJobFromCache,
  useExtractionJobs,
} from "@/features/page-extraction/hooks/useExtractionJobs";
import { useExtractionRunLauncher } from "@/features/page-extraction/hooks/useExtractionRunLauncher";
import { deleteJob } from "@/features/page-extraction/api/jobs";
import {
  selectJobForFile,
  viewJobForFile,
} from "@/features/page-extraction/redux/pageExtractionSlice";
import {
  selectSelectedJobForFile,
  selectViewedJobForFile,
} from "@/features/page-extraction/redux/selectors";
import type { PageExtractionJob } from "@/features/page-extraction/types";

export function SavedJobsList({ fileId }: { fileId: string }) {
  const { jobs, loading, refetch } = useExtractionJobs(fileId);
  const dispatch = useAppDispatch();
  const toast = useToastManager("page-extraction");
  const selectedJobId = useAppSelector((s) =>
    selectSelectedJobForFile(s, fileId),
  );
  const viewedJobId = useAppSelector((s) => selectViewedJobForFile(s, fileId));
  const { launch, dialog, running } = useExtractionRunLauncher();
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);

  if (!fileId) return null;
  if (loading && jobs.length === 0) return null;
  if (jobs.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground/70 leading-snug px-1">
        No saved templates yet. Configure below and click{" "}
        <span className="font-medium">Save template</span> to add one.
      </p>
    );
  }

  const handleRowClick = (job: PageExtractionJob) => {
    dispatch(selectJobForFile({ fileId, jobId: job.id }));
  };

  const handleRunAgain = async (job: PageExtractionJob) => {
    // The launcher decides whether to run immediately or prompt
    // (replace / run-as-new) when the template has run before. It also
    // owns selecting/viewing the right job, so we don't pre-select here.
    setRunningJobId(job.id);
    try {
      await launch(fileId, job);
    } finally {
      setRunningJobId(null);
    }
  };

  const handleDelete = async (job: PageExtractionJob) => {
    const ok = await confirm({
      title: "Delete template",
      description:
        'Delete "' +
        job.name +
        '"? The template will be removed from this list. Extraction data stays — clear it separately from the Results tab.',
      confirmLabel: "Delete template",
      variant: "destructive",
    });
    if (!ok) return;
    setDeletingJobId(job.id);
    try {
      await deleteJob(job.id);
      // Drop the archived row from the shared cache immediately so the
      // sidebar list updates without waiting for Realtime (the soft
      // delete sets archived_at, which Realtime will report as an
      // UPDATE — listJobsForFile would then filter it out on refetch).
      removeJobFromCache(fileId, job.id);
      // Clear any pointer to the now-gone job so the form / data view
      // don't dangle on a deleted id. Both pointers are independent
      // (sidebar vs. data view), so check both.
      if (selectedJobId === job.id) {
        dispatch(selectJobForFile({ fileId, jobId: null }));
      }
      if (viewedJobId === job.id) {
        dispatch(viewJobForFile({ fileId, jobId: null }));
      }
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
        {jobs.map((job) => {
          const isSelected = selectedJobId === job.id;
          return (
            <li
              key={job.id}
              className={cn(
                "flex items-center gap-1 px-2 py-1.5 border rounded-md text-[11px] transition-colors cursor-pointer",
                isSelected
                  ? "border-primary/60 bg-primary/5"
                  : "border-border bg-card hover:bg-accent/30",
              )}
              onClick={() => handleRowClick(job)}
              role="button"
            >
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "font-medium truncate",
                    isSelected ? "text-primary" : "text-foreground",
                  )}
                >
                  {job.name}
                </p>
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  chunk {job.chunk_size} · {job.source_variations?.length ?? 1}{" "}
                  src ·{" "}
                  {job.scope_pages?.length
                    ? `${job.scope_pages.length} pages`
                    : "all pages"}
                </p>
              </div>

              {/* Trash + play. No pencil — clicking the row loads it. */}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                title="Delete template (data stays)"
                disabled={deletingJobId === job.id}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDelete(job);
                }}
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
                title="Run a new extraction with this template"
                disabled={running || runningJobId === job.id}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleRunAgain(job);
                }}
              >
                {runningJobId === job.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
              </Button>
            </li>
          );
        })}
      </ul>
      {dialog}
    </div>
  );
}
