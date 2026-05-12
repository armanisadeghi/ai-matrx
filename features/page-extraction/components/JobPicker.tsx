/**
 * features/page-extraction/components/JobPicker.tsx
 *
 * Dropdown selecting which Job is active for the current file. Writes
 * the choice into Redux (selectedJobByFile) so other components in the
 * extractions pane (results table, progress bar) follow it.
 */

"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useExtractionJobs } from "@/features/page-extraction/hooks/useExtractionJobs";
import {
  selectJobForFile,
} from "@/features/page-extraction/redux/pageExtractionSlice";
import { selectSelectedJobForFile } from "@/features/page-extraction/redux/selectors";

export function JobPicker({ fileId }: { fileId: string | null }) {
  const dispatch = useAppDispatch();
  const { jobs, loading } = useExtractionJobs(fileId);
  const selectedJobId = useAppSelector((s) =>
    selectSelectedJobForFile(s, fileId),
  );

  // Auto-select the most recent job once jobs load and nothing is selected.
  useEffect(() => {
    if (!fileId) return;
    if (selectedJobId) return;
    if (jobs.length === 0) return;
    dispatch(selectJobForFile({ fileId, jobId: jobs[0].id }));
  }, [fileId, selectedJobId, jobs, dispatch]);

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
      <span className="text-xs text-muted-foreground shrink-0">Job</span>
      <Select
        value={selectedJobId ?? undefined}
        onValueChange={(jobId) =>
          dispatch(selectJobForFile({ fileId, jobId }))
        }
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue placeholder="Pick a job…" />
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
