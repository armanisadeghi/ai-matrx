/**
 * features/page-extraction/redux/selectors.ts
 *
 * Memoized selectors over the pageExtraction slice.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import type {
  ActiveJobRun,
  ActivePageRun,
  ChunkingConfigDraft,
} from "@/features/page-extraction/redux/pageExtractionSlice";
import {
  emptyDraft,
  EXTRACTIONS_ALL_VIEW,
} from "@/features/page-extraction/redux/pageExtractionSlice";

// Slice key is hardcoded to match the rootReducer mount point.
const root = (s: RootState) =>
  (
    s as RootState & {
      pageExtraction?: import("./pageExtractionSlice").PageExtractionState;
    }
  ).pageExtraction;

/** Bumped after an out-of-band results delete (e.g. deleting a run). The
 *  results tables watch this to refetch. */
export const selectResultsRefreshNonce = (state: RootState): number =>
  root(state)?.resultsRefreshNonce ?? 0;

export const selectActiveRunByJob = (
  state: RootState,
  jobId: string | null | undefined,
): ActiveJobRun | null => {
  if (!jobId) return null;
  return root(state)?.activeRuns[jobId] ?? null;
};

export const selectSelectedJobForFile = (
  state: RootState,
  fileId: string | null | undefined,
): string | null => {
  if (!fileId) return null;
  return root(state)?.selectedJobByFile[fileId] ?? null;
};

/**
 * The job whose **data** is being viewed in the main extractions pane.
 * Falls back to `selectedJobByFile` when the user hasn't explicitly
 * picked a different one in the JobPicker — so by default, the data
 * view follows the sidebar.
 *
 * Use this for the main pane (JobPicker, RunProgressBar, ResultsTable,
 * ChunksTab activeRun overlay). Use `selectSelectedJobForFile` for the
 * right inspector (ChunkingConfigForm, SavedJobsList highlight).
 *
 * Default: when nothing has been explicitly viewed or selected (e.g. fresh
 * load / after reload), resolve to the All-extractions view rather than an
 * empty "pick a job" state — that's the most useful landing view and avoids
 * the confusing "nothing selected" default.
 */
export const selectViewedJobForFile = (
  state: RootState,
  fileId: string | null | undefined,
): string | null => {
  if (!fileId) return null;
  const r = root(state);
  return (
    r?.viewedJobByFile[fileId] ??
    r?.selectedJobByFile[fileId] ??
    EXTRACTIONS_ALL_VIEW
  );
};

/**
 * True when the ChunkingConfigForm should be rendered as the full editor
 * for this file. False means: render the read-only display (when a job is
 * selected) or the empty-list state (when nothing is selected).
 */
export const selectIsEditingForFile = (
  state: RootState,
  fileId: string | null | undefined,
): boolean => {
  if (!fileId) return false;
  return root(state)?.editingByFile[fileId] === true;
};

const selectPageRunsRecord = (
  state: RootState,
  jobId: string | null | undefined,
): Record<string, ActivePageRun> | null => {
  const run = selectActiveRunByJob(state, jobId);
  return run?.pageRuns ?? null;
};

export const makeSelectOrderedPageRuns = () =>
  createSelector([selectPageRunsRecord], (recordOrNull) => {
    if (!recordOrNull) return [] as ActivePageRun[];
    return Object.values(recordOrNull).sort(
      (a, b) => a.chunkIndex - b.chunkIndex,
    );
  });

export interface RunProgressView {
  status: ActiveJobRun["status"] | "idle";
  chunkCount: number;
  completedChunks: number;
  failedChunks: number;
  resultCount: number;
  totalCost: number;
  totalTokens: number;
}

const IDLE_PROGRESS: RunProgressView = {
  status: "idle",
  chunkCount: 0,
  completedChunks: 0,
  failedChunks: 0,
  resultCount: 0,
  totalCost: 0,
  totalTokens: 0,
};

// ─── Chunking config draft ────────────────────────────────────────────────

/** Stable empty draft reference for files that haven't started a draft yet. */
const EMPTY_DRAFT_SINGLETON = emptyDraft();

export const selectDraftForFile = (
  state: RootState,
  fileId: string | null | undefined,
): ChunkingConfigDraft => {
  if (!fileId) return EMPTY_DRAFT_SINGLETON;
  return root(state)?.draftsByFile[fileId] ?? EMPTY_DRAFT_SINGLETON;
};

// ─── Run progress ────────────────────────────────────────────────────────

export const selectRunProgress = createSelector(
  [selectActiveRunByJob],
  (run): RunProgressView => {
    if (!run) return IDLE_PROGRESS;
    return {
      status: run.status,
      chunkCount: run.chunkCount,
      completedChunks: run.completedChunks,
      failedChunks: run.failedChunks,
      resultCount: run.resultCount,
      totalCost: run.totalCost,
      totalTokens: run.totalTokens,
    };
  },
);
