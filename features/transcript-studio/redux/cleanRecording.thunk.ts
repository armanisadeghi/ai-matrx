/**
 * cleanRecordingThunk — Scribe's recording-aligned cleaning pipeline.
 *
 * Where `runCleaningPassThunk` cleans a moving *time window* (Studio's interval
 * cleaner), this cleans exactly ONE recording: when a recording closes (manual
 * stop, or a periodic auto-rotation during continuous capture) we take that
 * recording's raw text and produce ONE cleaned segment anchored to its
 * `recording_segment_id`. The full-session clean is the ordered concatenation
 * of those rows (see `selectSessionCleanedText`), so there is no separate
 * monolithic clean document to keep in sync.
 *
 * Idempotent / re-runnable: supersession is scoped to the same
 * `recording_segment_id`, so re-cleaning a recording (the per-recording
 * "refresh" action) replaces only that recording's prior clean.
 *
 * One pass:
 *   1. Gather THIS recording's raw segments. If empty (silent recording),
 *      short-circuit — nothing to clean.
 *   2. Build `prior_cleaned_suffix` from earlier recordings' cleans for
 *      cross-recording continuity, and `raw_window` = this recording's raw.
 *   3. Insert a `studio_runs` audit row.
 *   4. Launch the cleaning agent (background display mode).
 *   5. Strip `[[RESUME]]` and persist via `applyCleanupRun` anchored to the
 *      recording id (+ `cleanedSegmentApplied`).
 *   6. Finalize the run row.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  applyCleanupRun,
  finalizeAgentRun,
  insertAgentRun,
} from "../service/studioService";
import {
  buildRecordingCleaningWindow,
  stripResumeMarker,
} from "../service/agentScopeBuilder";
import { DEFAULT_CLEANING_SHORTCUT_ID } from "../constants";
import type {
  CleanedSegment,
  RawSegment,
  RecordingSegment,
  TriggerCause,
} from "../types";
import { cleanedSegmentApplied, runUpserted } from "./slice";

interface CleanRecordingArgs {
  sessionId: string;
  recordingSegmentId: string;
  triggerCause: TriggerCause;
  /** Override the studio default. Falls back to DEFAULT_CLEANING_SHORTCUT_ID. */
  shortcutId?: string;
}

export type CleanRecordingResult =
  | { status: "skipped"; reason: "no-raw" | "no-session" | "no-recording" }
  | { status: "complete"; runId: string; cleanedSegmentId: string }
  | { status: "failed"; runId: string | null; error: string };

export const cleanRecordingThunk = createAsyncThunk<
  CleanRecordingResult,
  CleanRecordingArgs,
  { state: RootState; dispatch: AppDispatch }
>("transcriptStudio/cleanRecording", async (args, { dispatch, getState }) => {
  const { sessionId, recordingSegmentId, triggerCause } = args;
  const shortcutId = args.shortcutId ?? DEFAULT_CLEANING_SHORTCUT_ID;

  const state = getState();
  const session = state.transcriptStudio.byId[sessionId];
  if (!session) return { status: "skipped", reason: "no-session" };

  const recording: RecordingSegment | undefined =
    state.transcriptStudio.recordingSegmentsById[sessionId]?.[
      recordingSegmentId
    ];
  if (!recording) return { status: "skipped", reason: "no-recording" };

  // All raw for the session, then split: this recording's raw vs. earlier.
  const rawIds = state.transcriptStudio.rawIdsBySession[sessionId] ?? [];
  const allRaw: RawSegment[] = rawIds
    .map((id) => state.transcriptStudio.rawById[sessionId]?.[id])
    .filter((s): s is RawSegment => Boolean(s));
  const recordingRaws = allRaw
    .filter((s) => s.recordingSegmentId === recordingSegmentId)
    .sort((a, b) => a.tStart - b.tStart);

  if (recordingRaws.length === 0) {
    return { status: "skipped", reason: "no-raw" };
  }

  // Earlier recordings' active cleans feed continuity. "Earlier" = cleaned
  // segments anchored to a recording that ended at/before this one started.
  const cleanedIds =
    state.transcriptStudio.cleanedIdsBySession[sessionId] ?? [];
  const allCleaned: CleanedSegment[] = cleanedIds
    .map((id) => state.transcriptStudio.cleanedById[sessionId]?.[id])
    .filter((s): s is CleanedSegment => Boolean(s));
  const priorCleaned = allCleaned
    .filter(
      (c) =>
        c.recordingSegmentId !== recordingSegmentId &&
        c.tEnd <= recording.tStart,
    )
    .sort((a, b) => a.tStart - b.tStart);

  const window = buildRecordingCleaningWindow({
    recordingRaws,
    priorCleaned,
    session,
  });
  if (!window.rawWindow) {
    return { status: "skipped", reason: "no-raw" };
  }

  // Pass index: one past the highest active cleaned pass.
  const lastPassIndex = allCleaned.reduce(
    (max, s) => (s.passIndex > max ? s.passIndex : max),
    -1,
  );
  const passIndex = lastPassIndex + 1;

  let run;
  try {
    run = await insertAgentRun({
      sessionId,
      columnIdx: 2,
      shortcutId,
      triggerCause,
      resumeMarker: "[[RESUME]]",
    });
    dispatch(runUpserted({ run }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record run";
    return { status: "failed", runId: null, error: message };
  }

  let conversationId: string | null = null;
  let responseText: string | undefined;
  try {
    const result = (await dispatch(
      launchAgentExecution({
        shortcutId,
        surfaceKey: `studio:cleanup:${sessionId}`,
        sourceFeature: "transcript-studio",
        runtime: { applicationScope: window.scope },
        config: { displayMode: "background", autoRun: true },
      }),
    ).unwrap()) as { conversationId: string; responseText?: string };
    conversationId = result.conversationId ?? null;
    responseText = result.responseText;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Cleaning agent invocation failed";
    await failRun(run.id, conversationId, message, dispatch);
    return { status: "failed", runId: run.id, error: message };
  }

  const cleanedText = responseText ? stripResumeMarker(responseText) : null;
  if (!cleanedText) {
    const error = "Cleaning agent returned an empty response";
    await failRun(run.id, conversationId, error, dispatch);
    return { status: "failed", runId: run.id, error };
  }

  let segment;
  try {
    segment = await applyCleanupRun({
      sessionId,
      runId: run.id,
      passIndex,
      tStart: window.tStart ?? recording.tStart,
      tEnd: window.tEnd ?? recording.tEnd ?? recording.tStart,
      text: cleanedText,
      triggerCause,
      recordingSegmentId,
      processorKey: "clean",
    });
    dispatch(cleanedSegmentApplied({ sessionId, segment }));
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to persist cleaned segment";
    await failRun(run.id, conversationId, message, dispatch);
    return { status: "failed", runId: run.id, error: message };
  }

  try {
    const finalized = await finalizeAgentRun({
      id: run.id,
      status: "complete",
      conversationId,
    });
    dispatch(runUpserted({ run: finalized }));
  } catch {
    // Cleaned segment landed; a failed status flip is non-fatal.
  }

  return { status: "complete", runId: run.id, cleanedSegmentId: segment.id };
});

async function failRun(
  id: string,
  conversationId: string | null,
  error: string,
  dispatch: AppDispatch,
): Promise<void> {
  try {
    const failed = await finalizeAgentRun({
      id,
      status: "failed",
      conversationId,
      error,
    });
    dispatch(runUpserted({ run: failed }));
  } catch {
    /* swallow — original error is the user-relevant one */
  }
}
