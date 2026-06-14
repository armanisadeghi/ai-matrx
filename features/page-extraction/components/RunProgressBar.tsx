/**
 * features/page-extraction/components/RunProgressBar.tsx
 *
 * Live progress bar for an active extraction run. Reads from the
 * pageExtraction slice (filled by useExtractionStream) so it ticks
 * the moment a chunk lands without waiting on Realtime.
 */

"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToastManager } from "@/hooks/useToastManager";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { deleteRun } from "@/features/page-extraction/api/runs";
import {
  selectActiveRunByJob,
  selectRunProgress,
} from "@/features/page-extraction/redux/selectors";
import {
  clearRun,
  invalidateResults,
  isAllJobsView,
} from "@/features/page-extraction/redux/pageExtractionSlice";

export function RunProgressBar({ jobId }: { jobId: string | null }) {
  // Run progress is per-template — the "All" view aggregates results
  // from every template, which doesn't have a single progress bar to
  // show. Hide it; users wanting to watch a specific run pick that
  // template in the View dropdown.
  const isAll = isAllJobsView(jobId);
  const progress = useAppSelector((s) =>
    selectRunProgress(s, isAll ? null : jobId),
  );
  const runId = useAppSelector(
    (s) => selectActiveRunByJob(s, isAll ? null : jobId)?.runId ?? null,
  );
  const dispatch = useAppDispatch();
  const toast = useToastManager("page-extraction");
  const [deleting, setDeleting] = useState(false);

  const isTerminal =
    progress.status === "completed" || progress.status === "failed";

  const handleDeleteRun = async () => {
    if (!jobId || isAll || !runId) return;
    const ok = await confirm({
      title: "Delete this run",
      description:
        "Permanently delete this entire run — its chunk runs and all " +
        progress.resultCount +
        " result row" +
        (progress.resultCount === 1 ? "" : "s") +
        " it produced. The template stays, so you can run it again. This cannot be undone.",
      confirmLabel: "Delete run",
      variant: "destructive",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteRun(runId);
      // Drop the run from the slice (hides this bar + clears the Chunks
      // tab's per-chunk Agent-output overlay) and tell the results table
      // its rows changed underneath it.
      dispatch(clearRun({ jobId }));
      dispatch(invalidateResults());
      toast.success("Deleted run");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  if (!jobId || isAll || progress.status === "idle") return null;

  const pct =
    progress.chunkCount > 0
      ? Math.round(
          ((progress.completedChunks + progress.failedChunks) /
            progress.chunkCount) *
            100,
        )
      : 0;

  const statusLabel =
    progress.status === "running"
      ? `${progress.completedChunks + progress.failedChunks} / ${progress.chunkCount} chunks`
      : progress.status === "completed"
        ? "Complete"
        : "Failed";

  return (
    <div className="flex flex-col gap-1 px-3 py-2 border-b border-border">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{statusLabel}</span>
        <div className="flex items-center gap-1.5">
          <span>
            {progress.resultCount} result{progress.resultCount === 1 ? "" : "s"}
            {progress.failedChunks > 0
              ? ` · ${progress.failedChunks} failed`
              : ""}
          </span>
          {isTerminal && runId && (
            <Button
              size="sm"
              variant="ghost"
              className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
              disabled={deleting}
              onClick={() => void handleDeleteRun()}
              title="Delete this entire run (chunks + results); the template stays"
            >
              {deleting ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3 mr-1" />
              )}
              Delete run
            </Button>
          )}
        </div>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}
