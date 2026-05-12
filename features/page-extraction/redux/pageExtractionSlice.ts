/**
 * features/page-extraction/redux/pageExtractionSlice.ts
 *
 * Holds per-Job state needed across components:
 *   - active run id + lifecycle status
 *   - per-page-run progress (status, page numbers, error message)
 *   - aggregate counts derived from stream events (so the progress bar
 *     reacts before the Supabase rollup trigger fires)
 *
 * The Job rows themselves and the Results rows are read directly from
 * Supabase (via hooks below) — they're not duplicated into Redux. We only
 * keep the *transient* lifecycle here. That's the same split the file-
 * analysis shared-cache pattern uses.
 */

"use client";

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  ChunkingStrategy,
  SourceVariationKind,
} from "@/features/page-extraction/types";

export interface ActivePageRun {
  pageRunId: string;
  chunkIndex: number;
  pageNumbers: number[];
  status: "running" | "completed" | "failed";
  resultCount?: number;
  cost?: number;
  tokens?: number;
  durationMs?: number;
  error?: string;
}

export interface ActiveJobRun {
  runId: string;
  jobId: string;
  status: "running" | "completed" | "failed";
  chunkCount: number;
  completedChunks: number;
  failedChunks: number;
  resultCount: number;
  totalCost: number;
  totalTokens: number;
  /** pageRunId → progress entry */
  pageRuns: Record<string, ActivePageRun>;
  /** Surface-relative grouping: by file so multiple files can run concurrently. */
  fileId: string;
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

/**
 * In-memory chunking configuration the user is building before clicking Run.
 *
 * The form lives in the inspector; the chunks visualization lives in the
 * Extractions pane. Both read this object from Redux so they stay in sync
 * as the user edits inputs.
 *
 * Nothing here is required to have a value — the run-launcher validates
 * before dispatching. `chunkSize === null` and `scopePages === []` both
 * mean "user hasn't filled this in yet" (NOT "default to all" — there
 * are no silent defaults).
 */
export interface ChunkingConfigDraft {
  /** User-picked agent to invoke. */
  agentId: string | null;
  /** Verbatim text of the page-range input (e.g. "1-50, 80-90"). */
  scopePagesInputRaw: string;
  /** Resolved page numbers parsed from the input. */
  scopePages: number[];
  /** Pages per chunk. Required before Run; null until set. */
  chunkSize: number | null;
  chunkOverlap: number;
  /** Inputs to send to the agent per chunk. */
  sourceVariations: SourceVariationKind[];
  chunkingStrategy: ChunkingStrategy;
  /** Optional Job name to attach (becomes a saved Job if user toggles save). */
  jobName: string;
  /** Whether clicking Run should persist this draft as a reusable Job. */
  saveAsJob: boolean;
  /** Per-surface → per-agent variable name overrides. The draft inherits
   *  the chosen agent's defaults when set. */
  variableMapping: Record<string, string>;
  /** Optional output JSON schema the agent's response should conform to.
   *  Null = inherit from agent. */
  outputSchema: unknown | null;
  /** Maximum concurrent chunks. */
  maxConcurrent: number;
}

export const emptyDraft = (): ChunkingConfigDraft => ({
  agentId: null,
  scopePagesInputRaw: "",
  scopePages: [],
  chunkSize: null,
  chunkOverlap: 0,
  sourceVariations: ["clean_text"],
  chunkingStrategy: "pages",
  jobName: "",
  saveAsJob: false,
  variableMapping: {},
  outputSchema: null,
  maxConcurrent: 3,
});

export interface PageExtractionState {
  /** jobId → active or last-known run state for that job */
  activeRuns: Record<string, ActiveJobRun>;
  /** fileId → currently-visible jobId (UI selection). */
  selectedJobByFile: Record<string, string>;
  /** fileId → in-memory chunking config the user is currently building. */
  draftsByFile: Record<string, ChunkingConfigDraft>;
}

const initialState: PageExtractionState = {
  activeRuns: {},
  selectedJobByFile: {},
  draftsByFile: {},
};

const slice = createSlice({
  name: "pageExtraction",
  initialState,
  reducers: {
    selectJobForFile(
      state,
      action: PayloadAction<{ fileId: string; jobId: string | null }>,
    ) {
      const { fileId, jobId } = action.payload;
      if (jobId) state.selectedJobByFile[fileId] = jobId;
      else delete state.selectedJobByFile[fileId];
    },

    runStarted(
      state,
      action: PayloadAction<{
        runId: string;
        jobId: string;
        fileId: string;
        chunkCount: number;
      }>,
    ) {
      const { runId, jobId, fileId, chunkCount } = action.payload;
      state.activeRuns[jobId] = {
        runId,
        jobId,
        fileId,
        status: "running",
        chunkCount,
        completedChunks: 0,
        failedChunks: 0,
        resultCount: 0,
        totalCost: 0,
        totalTokens: 0,
        pageRuns: {},
        startedAt: Date.now(),
      };
    },

    pageRunStarted(
      state,
      action: PayloadAction<{
        jobId: string;
        pageRunId: string;
        chunkIndex: number;
        pageNumbers: number[];
      }>,
    ) {
      const { jobId, pageRunId, chunkIndex, pageNumbers } = action.payload;
      const run = state.activeRuns[jobId];
      if (!run) return;
      run.pageRuns[pageRunId] = {
        pageRunId,
        chunkIndex,
        pageNumbers,
        status: "running",
      };
    },

    pageRunCompleted(
      state,
      action: PayloadAction<{
        jobId: string;
        pageRunId: string;
        chunkIndex: number;
        pageNumbers: number[];
        resultCount: number;
        cost: number;
        tokens: number;
        durationMs: number;
      }>,
    ) {
      const {
        jobId,
        pageRunId,
        chunkIndex,
        pageNumbers,
        resultCount,
        cost,
        tokens,
        durationMs,
      } = action.payload;
      const run = state.activeRuns[jobId];
      if (!run) return;
      run.pageRuns[pageRunId] = {
        pageRunId,
        chunkIndex,
        pageNumbers,
        status: "completed",
        resultCount,
        cost,
        tokens,
        durationMs,
      };
      run.completedChunks += 1;
      run.resultCount += resultCount;
      run.totalCost += cost;
      run.totalTokens += tokens;
    },

    pageRunFailed(
      state,
      action: PayloadAction<{
        jobId: string;
        pageRunId: string;
        chunkIndex: number;
        pageNumbers: number[];
        error: string;
      }>,
    ) {
      const { jobId, pageRunId, chunkIndex, pageNumbers, error } =
        action.payload;
      const run = state.activeRuns[jobId];
      if (!run) return;
      run.pageRuns[pageRunId] = {
        pageRunId,
        chunkIndex,
        pageNumbers,
        status: "failed",
        error,
      };
      run.failedChunks += 1;
    },

    runCompleted(
      state,
      action: PayloadAction<{
        jobId: string;
        runId: string;
        resultCount: number;
        completedChunks: number;
        failedChunks: number;
        totalCost: number;
        totalTokens: number;
      }>,
    ) {
      const {
        jobId,
        runId,
        resultCount,
        completedChunks,
        failedChunks,
        totalCost,
        totalTokens,
      } = action.payload;
      const run = state.activeRuns[jobId];
      if (!run || run.runId !== runId) return;
      run.status = "completed";
      run.resultCount = resultCount;
      run.completedChunks = completedChunks;
      run.failedChunks = failedChunks;
      run.totalCost = totalCost;
      run.totalTokens = totalTokens;
      run.finishedAt = Date.now();
    },

    runFailed(
      state,
      action: PayloadAction<{ jobId: string; runId: string; error: string }>,
    ) {
      const { jobId, runId, error } = action.payload;
      const run = state.activeRuns[jobId];
      if (!run || run.runId !== runId) return;
      run.status = "failed";
      run.error = error;
      run.finishedAt = Date.now();
    },

    clearRun(state, action: PayloadAction<{ jobId: string }>) {
      delete state.activeRuns[action.payload.jobId];
    },

    // ── Chunking config draft ────────────────────────────────────────────

    ensureDraft(state, action: PayloadAction<{ fileId: string }>) {
      const { fileId } = action.payload;
      if (!state.draftsByFile[fileId]) {
        state.draftsByFile[fileId] = emptyDraft();
      }
    },

    patchDraft(
      state,
      action: PayloadAction<{
        fileId: string;
        patch: Partial<ChunkingConfigDraft>;
      }>,
    ) {
      const { fileId, patch } = action.payload;
      const current = state.draftsByFile[fileId] ?? emptyDraft();
      state.draftsByFile[fileId] = { ...current, ...patch };
    },

    toggleDraftVariation(
      state,
      action: PayloadAction<{
        fileId: string;
        kind: SourceVariationKind;
      }>,
    ) {
      const { fileId, kind } = action.payload;
      const draft = state.draftsByFile[fileId] ?? emptyDraft();
      const set = new Set(draft.sourceVariations);
      if (set.has(kind)) set.delete(kind);
      else set.add(kind);
      state.draftsByFile[fileId] = {
        ...draft,
        sourceVariations: Array.from(set),
      };
    },

    clearDraft(state, action: PayloadAction<{ fileId: string }>) {
      delete state.draftsByFile[action.payload.fileId];
    },
  },
});

export const {
  selectJobForFile,
  runStarted,
  pageRunStarted,
  pageRunCompleted,
  pageRunFailed,
  runCompleted,
  runFailed,
  clearRun,
  ensureDraft,
  patchDraft,
  toggleDraftVariation,
  clearDraft,
} = slice.actions;

export default slice.reducer;
