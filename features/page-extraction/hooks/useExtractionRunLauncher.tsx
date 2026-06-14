/**
 * features/page-extraction/hooks/useExtractionRunLauncher.tsx
 *
 * Single entry point for launching a template run from anywhere in the
 * extraction UI (the saved-jobs list, the read-only template view, future
 * "save & run" flows). It exists so the "you've run this before" guard lives
 * in exactly one place instead of being re-implemented per button.
 *
 * Behavior:
 *   - First run of a template → start immediately.
 *   - Re-run of a template that has run before (a persisted `latest_run_id`
 *     OR an in-memory active run) → open {@link RerunPromptDialog}:
 *       • Replace    → clear the template's results, then run again.
 *       • Run as new → clone the template as "<name> (2)" and run that,
 *                      leaving the original run intact, then view the clone.
 *
 * Usage:
 *   const { launch, dialog, running } = useExtractionRunLauncher();
 *   <button onClick={() => launch(fileId, job)} />
 *   {dialog}  // render once in the component
 */

"use client";

import { useCallback, useState } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { useToastManager } from "@/hooks/useToastManager";
import { useExtractionStream } from "@/features/page-extraction/hooks/useExtractionStream";
import {
  cloneJobWithName,
  clearJobResults,
  listJobsForFile,
} from "@/features/page-extraction/api/jobs";
import {
  selectJobForFile,
  viewJobForFile,
} from "@/features/page-extraction/redux/pageExtractionSlice";
import { selectActiveRunByJob } from "@/features/page-extraction/redux/selectors";
import { upsertJobInCache } from "@/features/page-extraction/hooks/useExtractionJobs";
import {
  RerunPromptDialog,
  type RerunBusyAction,
} from "@/features/page-extraction/components/RerunPromptDialog";
import type { PageExtractionJob } from "@/features/page-extraction/types";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip a trailing " (N)" so re-running "Invoices (2)" still bases off "Invoices". */
function baseNameOf(name: string): string {
  return name.replace(/\s*\(\d+\)\s*$/, "").trim();
}

/**
 * Next available "<stem> (N)" for a base name, given the file's existing
 * template names. The base itself counts as #1, so the first clone is (2).
 */
export function nextRerunName(
  baseName: string,
  existingNames: string[],
): string {
  const stem = baseNameOf(baseName) || baseName.trim();
  const re = new RegExp(`^${escapeRegExp(stem)}\\s*\\((\\d+)\\)$`);
  let max = 1;
  for (const raw of existingNames) {
    const n = raw.trim();
    if (n === stem) continue; // the base — already counted as 1
    const m = re.exec(n);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `${stem} (${max + 1})`;
}

export interface UseExtractionRunLauncherResult {
  /** Launch a run for `job`, prompting first if it has been run before. */
  launch: (fileId: string, job: PageExtractionJob) => Promise<void>;
  /** Render this once in the consuming component. */
  dialog: React.ReactNode;
  /** True while an SSE run is streaming. */
  running: boolean;
}

export function useExtractionRunLauncher(): UseExtractionRunLauncherResult {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const toast = useToastManager("page-extraction");
  const { running, start } = useExtractionStream();

  const [pending, setPending] = useState<{
    fileId: string;
    job: PageExtractionJob;
  } | null>(null);
  const [newName, setNewName] = useState("");
  const [busyAction, setBusyAction] = useState<RerunBusyAction>(null);

  const runJob = useCallback(
    async (fileId: string, jobId: string) => {
      // Selecting also propagates to the viewed job, so the pane follows the
      // run that's about to stream.
      dispatch(selectJobForFile({ fileId, jobId }));
      try {
        await start(fileId, { job_id: jobId });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Run failed");
      }
    },
    [dispatch, start, toast],
  );

  const hasRunBefore = useCallback(
    (job: PageExtractionJob): boolean => {
      if (job.latest_run_id) return true;
      // Catch a same-session run whose latest_run_id hasn't been refetched
      // onto this job object yet.
      return !!selectActiveRunByJob(store.getState(), job.id);
    },
    [store],
  );

  const launch = useCallback(
    async (fileId: string, job: PageExtractionJob) => {
      if (!hasRunBefore(job)) {
        await runJob(fileId, job.id);
        return;
      }
      // Precompute the "(2)" name from the file's current templates.
      let suggested = `${baseNameOf(job.name) || job.name} (2)`;
      try {
        const jobs = await listJobsForFile(fileId, {
          savedOnly: false,
          includeArchived: true,
        });
        suggested = nextRerunName(
          job.name,
          jobs.map((j) => j.name),
        );
      } catch {
        // Fall back to the naive (2) suffix — the prompt still works.
      }
      setNewName(suggested);
      setPending({ fileId, job });
    },
    [hasRunBefore, runJob],
  );

  const handleReplace = useCallback(async () => {
    if (!pending) return;
    setBusyAction("replace");
    try {
      await clearJobResults(pending.job.id);
      await runJob(pending.fileId, pending.job.id);
      setPending(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Replace failed");
    } finally {
      setBusyAction(null);
    }
  }, [pending, runJob, toast]);

  const handleAddNew = useCallback(async () => {
    if (!pending) return;
    setBusyAction("addNew");
    try {
      const clone = await cloneJobWithName(pending.job.id, newName);
      // Show the new "(2)" template in the saved list immediately (Realtime
      // will converge too, but the in-tab actor shouldn't wait for it).
      upsertJobInCache(pending.fileId, clone);
      dispatch(viewJobForFile({ fileId: pending.fileId, jobId: clone.id }));
      await runJob(pending.fileId, clone.id);
      toast.success(`Running as "${clone.name}"`);
      setPending(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Run-as-new failed");
    } finally {
      setBusyAction(null);
    }
  }, [pending, newName, dispatch, runJob, toast]);

  const dialog = (
    <RerunPromptDialog
      open={!!pending}
      jobName={pending?.job.name ?? ""}
      newName={newName}
      busyAction={busyAction}
      onReplace={() => void handleReplace()}
      onAddNew={() => void handleAddNew()}
      onCancel={() => {
        if (busyAction === null) setPending(null);
      }}
    />
  );

  return { launch, dialog, running };
}
