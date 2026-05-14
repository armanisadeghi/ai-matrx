/**
 * features/page-extraction/components/JobPicker.tsx
 *
 * Dropdown in the main extractions pane that picks which saved Job's
 * DATA the user is currently viewing (chunks preview, results table,
 * run progress). Writes to `viewedJobByFile` ONLY — never touches
 * `selectedJobByFile`. That decoupling is intentional: the user can
 * browse past results without dragging the right inspector's sidebar
 * along (which would kick them out of an in-progress "New template"
 * session). See `pageExtractionSlice` for the full rationale.
 *
 * The sidebar's own SavedJobsList is the canonical way to "select" a
 * template — when the user clicks a sidebar row, both `selectedJob`
 * and `viewedJob` update, so the data view follows. The asymmetry is:
 * sidebar → data view (yes); data view → sidebar (no).
 */

"use client";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useExtractionJobs } from "@/features/page-extraction/hooks/useExtractionJobs";
import { viewJobForFile } from "@/features/page-extraction/redux/pageExtractionSlice";
import { selectViewedJobForFile } from "@/features/page-extraction/redux/selectors";

export function JobPicker({ fileId }: { fileId: string | null }) {
  const dispatch = useAppDispatch();
  const { jobs, loading } = useExtractionJobs(fileId);
  const viewedJobId = useAppSelector((s) => selectViewedJobForFile(s, fileId));

  if (!fileId) return null;

  if (loading && jobs.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        Loading extractions…
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        No extraction jobs yet for this file.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
      <span className="text-xs text-muted-foreground shrink-0">View</span>
      <Select
        value={viewedJobId ?? undefined}
        onValueChange={(jobId) => dispatch(viewJobForFile({ fileId, jobId }))}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue placeholder="Pick a job to view…" />
        </SelectTrigger>
        <SelectContent>
          {jobs.map((j) => (
            <SelectItem key={j.id} value={j.id}>
              {j.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
