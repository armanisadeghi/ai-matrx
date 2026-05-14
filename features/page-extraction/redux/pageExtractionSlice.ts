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
  ExtraExtractionInput,
  SourceVariationKind,
} from "@/features/page-extraction/types";

/**
 * Sentinel for the "All extractions" view in the main extractions pane.
 * When `viewedJobByFile[fileId]` equals this string, the pane renders the
 * cross-template aggregate (every result row for the file, with a
 * `Template` column added) instead of a single Job's data. Stored as a
 * value in `viewedJobByFile` so we don't need a parallel boolean slice
 * field — the picker, the data view, and persistence all key off the
 * same record.
 *
 * The double-underscore prefix ensures it can never collide with a real
 * job id (UUIDs).
 */
export const EXTRACTIONS_ALL_VIEW = "__all__";

/**
 * Type guard for the All-view sentinel. Use this everywhere instead of
 * comparing the string literal so a future rename only touches this file.
 */
export function isAllJobsView(
  jobId: string | null | undefined,
): jobId is typeof EXTRACTIONS_ALL_VIEW {
  return jobId === EXTRACTIONS_ALL_VIEW;
}

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
  /** Live token buffer accumulated from `page_run.delta` events while the
   *  chunk is running. Replaced with `rawResponse` once the completed
   *  event arrives. Empty string by default. */
  streamingText: string;
  /** Final raw text the agent emitted, set on `page_run.completed`. */
  rawResponse?: string;
  /** Successfully-parsed JSON rows, set on `page_run.completed`. Null if
   *  parsing failed. */
  parsedPayload?: Record<string, unknown>[] | null;
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
  /** Extra inputs pulled from other templates' result rows. Each entry
   *  contributes a named surface variable the user can route via
   *  variable_mapping just like the built-in surface variations. */
  extraInputs: ExtraExtractionInput[];
  /**
   * Per-job override of the agent's default_rag_boost. `null` = inherit
   * the agent default (the common case). A number overrides for this
   * job's derivatives + the chunks the bridge writes from them.
   */
  ragBoost: number | null;
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
  extraInputs: [],
  ragBoost: null,
});

export interface PageExtractionState {
  /** jobId → active or last-known run state for that job */
  activeRuns: Record<string, ActiveJobRun>;
  /**
   * fileId → the template currently active in the **right inspector**
   * (the "Chunked Runs" sidebar). Drives ChunkingConfigForm — the
   * readonly view, the editor draft hydration, and the SavedJobsList
   * row highlight. Treat this as "what the user is editing / working
   * with right now."
   */
  selectedJobByFile: Record<string, string>;
  /**
   * fileId → the template whose **data** is currently being viewed in
   * the **main extractions pane** (the JobPicker dropdown, chunks/results
   * tabs, RunProgressBar). Decoupled from `selectedJobByFile` so the
   * user can browse past run output while building a new template in
   * the sidebar. Falls back to `selectedJobByFile` via
   * `selectViewedJobForFile` when not explicitly set.
   */
  viewedJobByFile: Record<string, string>;
  /** fileId → in-memory chunking config the user is currently building. */
  draftsByFile: Record<string, ChunkingConfigDraft>;
  /**
   * fileId → whether the ChunkingConfigForm is currently in EDIT mode.
   *
   * When false (and a job is selected), the form panel renders a clean
   * read-only display of the selected template plus Edit + Run buttons.
   * When true (or no job is selected and the user clicked "+ New"),
   * the full editor renders. This separation keeps the "I just want to
   * run this" flow from being buried under the editor every time.
   */
  editingByFile: Record<string, boolean>;
}

const initialState: PageExtractionState = {
  activeRuns: {},
  selectedJobByFile: {},
  viewedJobByFile: {},
  draftsByFile: {},
  editingByFile: {},
};

const slice = createSlice({
  name: "pageExtraction",
  initialState,
  reducers: {
    /**
     * The sidebar / form selector. Writes to `selectedJobByFile`. Also
     * propagates the new value down to `viewedJobByFile` so the main
     * pane's data view follows when the user explicitly picks a
     * template — that's the natural "click template → see its data"
     * flow. The converse (`viewJobForFile`) does NOT touch
     * `selectedJobByFile`, so changing the data view never kicks the
     * user out of whatever they're editing in the sidebar.
     *
     * Special case: clearing (`jobId = null`) only clears the sidebar.
     * The data view stays where it was — common scenario is "I'm
     * looking at template B's results, click 'New' to compose a new
     * template targeted at the gaps I see". The viewed run shouldn't
     * vanish when the sidebar deselects.
     */
    selectJobForFile(
      state,
      action: PayloadAction<{ fileId: string; jobId: string | null }>,
    ) {
      const { fileId, jobId } = action.payload;
      if (jobId) {
        state.selectedJobByFile[fileId] = jobId;
        state.viewedJobByFile[fileId] = jobId;
      } else {
        delete state.selectedJobByFile[fileId];
        // Intentionally leave viewedJobByFile alone.
      }
    },

    /**
     * The data-view selector. Writes to `viewedJobByFile` ONLY.
     * Used by the main extractions pane's JobPicker so the user can
     * browse a different run's results without the sidebar following
     * along (and dragging them out of an in-progress New-template
     * session). Passing `null` clears the viewed selection without
     * touching the sidebar.
     */
    viewJobForFile(
      state,
      action: PayloadAction<{ fileId: string; jobId: string | null }>,
    ) {
      const { fileId, jobId } = action.payload;
      if (jobId) state.viewedJobByFile[fileId] = jobId;
      else delete state.viewedJobByFile[fileId];
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
        streamingText: "",
      };
    },

    pageRunDelta(
      state,
      action: PayloadAction<{
        jobId: string;
        pageRunId: string;
        text: string;
      }>,
    ) {
      const { jobId, pageRunId, text } = action.payload;
      const run = state.activeRuns[jobId];
      if (!run) return;
      const pr = run.pageRuns[pageRunId];
      if (!pr) return;
      pr.streamingText = (pr.streamingText ?? "") + text;
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
        rawResponse: string;
        parsedPayload: Record<string, unknown>[] | null;
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
        rawResponse,
        parsedPayload,
      } = action.payload;
      const run = state.activeRuns[jobId];
      if (!run) return;
      const prior = run.pageRuns[pageRunId];
      run.pageRuns[pageRunId] = {
        pageRunId,
        chunkIndex,
        pageNumbers,
        status: "completed",
        resultCount,
        cost,
        tokens,
        durationMs,
        rawResponse,
        parsedPayload,
        // Preserve the streaming buffer so the UI can still see deltas in
        // the visible log; final state is signaled by status === "completed".
        streamingText: prior?.streamingText ?? rawResponse,
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
        rawResponse?: string;
      }>,
    ) {
      const { jobId, pageRunId, chunkIndex, pageNumbers, error, rawResponse } =
        action.payload;
      const run = state.activeRuns[jobId];
      if (!run) return;
      const prior = run.pageRuns[pageRunId];
      run.pageRuns[pageRunId] = {
        pageRunId,
        chunkIndex,
        pageNumbers,
        status: "failed",
        error,
        rawResponse,
        streamingText: prior?.streamingText ?? rawResponse ?? "",
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

    // ── Editing mode (form vs read-only) ─────────────────────────────────

    setEditing(
      state,
      action: PayloadAction<{ fileId: string; editing: boolean }>,
    ) {
      const { fileId, editing } = action.payload;
      if (editing) state.editingByFile[fileId] = true;
      else delete state.editingByFile[fileId];
    },
  },
});

export const {
  selectJobForFile,
  viewJobForFile,
  runStarted,
  pageRunStarted,
  pageRunDelta,
  pageRunCompleted,
  pageRunFailed,
  runCompleted,
  runFailed,
  clearRun,
  ensureDraft,
  patchDraft,
  toggleDraftVariation,
  clearDraft,
  setEditing,
} = slice.actions;

export default slice.reducer;
