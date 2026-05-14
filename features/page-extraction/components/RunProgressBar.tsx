/**
 * features/page-extraction/components/RunProgressBar.tsx
 *
 * Live progress bar for an active extraction run. Reads from the
 * pageExtraction slice (filled by useExtractionStream) so it ticks
 * the moment a chunk lands without waiting on Realtime.
 */

"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { Progress } from "@/components/ui/progress";
import { selectRunProgress } from "@/features/page-extraction/redux/selectors";
import { isAllJobsView } from "@/features/page-extraction/redux/pageExtractionSlice";

export function RunProgressBar({ jobId }: { jobId: string | null }) {
  // Run progress is per-template — the "All" view aggregates results
  // from every template, which doesn't have a single progress bar to
  // show. Hide it; users wanting to watch a specific run pick that
  // template in the View dropdown.
  const isAll = isAllJobsView(jobId);
  const progress = useAppSelector((s) =>
    selectRunProgress(s, isAll ? null : jobId),
  );

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
        <span>
          {progress.resultCount} result{progress.resultCount === 1 ? "" : "s"}
          {progress.failedChunks > 0
            ? ` · ${progress.failedChunks} failed`
            : ""}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}
