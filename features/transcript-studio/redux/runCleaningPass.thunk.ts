/**
 * runCleaningPassThunk — Column 2's load-bearing pipeline.
 *
 * One pass:
 *   1. Compute the cleaning window from current raw + active cleaned state.
 *      If there's no new raw text, short-circuit (idempotent — the trigger
 *      scheduler will retry on the next tick).
 *   2. Insert a `studio_runs` row (status='running') so Column 2 can show
 *      "running" in real time and so failures are auditable.
 *   3. Dispatch `launchAgentExecution` with the cleaning shortcut and the
 *      `prior_cleaned_suffix` / `raw_window` / `session_title` / `module_id`
 *      scope. Display mode = "background" so the OverlayController stays out
 *      of the way and the response comes back as `responseText`.
 *   4. Strip the `[[RESUME]]` marker from the response and apply via
 *      `applyCleanupRun` (DB) + `cleanedSegmentApplied` (Redux). Both
 *      stamp prior overlapping rows as superseded so the active list is
 *      monotonic non-overlapping.
 *   5. Finalize the run row (status='complete' or 'failed').
 *
 * Concurrency: enforced at call-site by `useTriggerScheduler` which holds a
 * per-column mutex. This thunk does NOT re-enforce — calling it twice in
 * parallel for the same column results in racing supersedes (last write wins,
 * audit trail still shows both runs).
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  applyCleanupRun,
  finalizeAgentRun,
  insertAgentRun,
} from "../service/studioService";
import {
  buildCleaningWindow,
  stripResumeMarker,
} from "../service/agentScopeBuilder";
import { DEFAULT_CLEANING_SHORTCUT_ID } from "../constants";
import type { TriggerCause } from "../types";
import { cleanedSegmentApplied, runUpserted } from "./slice";
import { watchLiveRun } from "./liveRunWatch";

interface RunCleaningPassArgs {
  sessionId: string;
  triggerCause: TriggerCause;
  /** Override the studio default. Falls back to DEFAULT_CLEANING_SHORTCUT_ID. */
  shortcutId?: string;
}

export type RunCleaningPassResult =
  | { status: "skipped"; reason: "no-new-raw" | "no-session" }
  | { status: "complete"; runId: string; cleanedSegmentId: string }
  | { status: "failed"; runId: string | null; error: string };

export const runCleaningPassThunk = createAsyncThunk<
  RunCleaningPassResult,
  RunCleaningPassArgs,
  { state: RootState }
>("transcriptStudio/runCleaningPass", async (args, { dispatch, getState }) => {
  const { sessionId, triggerCause } = args;
  const shortcutId = args.shortcutId ?? DEFAULT_CLEANING_SHORTCUT_ID;

  const state = getState();
  const session = state.transcriptStudio.byId[sessionId];
  if (!session) {
    return { status: "skipped", reason: "no-session" };
  }

  const rawIds = state.transcriptStudio.rawIdsBySession[sessionId] ?? [];
  const rawSegments = rawIds
    .map((id) => state.transcriptStudio.rawById[sessionId]?.[id])
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const cleanedIds = state.transcriptStudio.cleanedIdsBySession[sessionId] ?? [];
  const cleanedSegments = cleanedIds
    .map((id) => state.transcriptStudio.cleanedById[sessionId]?.[id])
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const window = buildCleaningWindow({
    rawSegments,
    cleanedSegments,
    session,
  });

  if (!window.rawWindow || window.replaceFromTime === null) {
    return { status: "skipped", reason: "no-new-raw" };
  }

  // Insert the audit row. Column 2 will show this run as "running" until
  // we finalize at the end of the pass.
  let run;
  try {
    run = await insertAgentRun({
      sessionId,
      columnIdx: 2,
      shortcutId,
      triggerCause,
      resumeMarker: "[[RESUME]]",
      inputCharRange: window.inputCharRange,
    });
    dispatch(runUpserted({ run }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record run";
    return { status: "failed", runId: null, error: message };
  }

  // Compute the next pass index. Active cleaned segments carry the index of
  // the run that produced them; we use lastIndex+1 for the new pass.
  const lastPassIndex = cleanedSegments.reduce(
    (max, s) => (s.passIndex > max ? s.passIndex : max),
    -1,
  );
  const passIndex = lastPassIndex + 1;

  let conversationId: string | null = null;
  let responseText: string | undefined;

  try {
    const result = (await dispatch(
      launchAgentExecution({
        shortcutId,
        surfaceKey: `studio:cleanup:${sessionId}`,
        sourceFeature: "transcription",
        runtime: { applicationScope: window.scope },
        config: {
          displayMode: "background",
          autoRun: true,
        },
        // THE FLOATING LAW — bind + float the run the moment its conversation
        // exists, not when the whole pass finally resolves. See `liveRunWatch.ts`.
        onConversationCreated: (cid) => {
          conversationId = cid;
          watchLiveRun({
            dispatch,
            sessionId,
            runId: run.id,
            columnIdx: 2,
            triggerCause,
            label: "Cleaning transcript",
          })(cid);
        },
      }),
    ).unwrap()) as {
      conversationId: string;
      responseText?: string;
    };
    conversationId = result.conversationId ?? conversationId;
    responseText = result.responseText;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Cleaning agent invocation failed";
    try {
      const failed = await finalizeAgentRun({
        id: run.id,
        status: "failed",
        conversationId,
        error: message,
      });
      dispatch(runUpserted({ run: failed }));
    } catch {
      /* swallow — original error is the user-relevant one */
    }
    return { status: "failed", runId: run.id, error: message };
  }

  if (!responseText || !responseText.trim()) {
    const error = "Cleaning agent returned an empty response";
    try {
      const failed = await finalizeAgentRun({
        id: run.id,
        status: "failed",
        conversationId,
        error,
      });
      dispatch(runUpserted({ run: failed }));
    } catch {
      /* swallow */
    }
    return { status: "failed", runId: run.id, error };
  }

  const cleanedText = stripResumeMarker(responseText);
  if (!cleanedText) {
    const error = "Cleaning agent returned empty body after stripping marker";
    try {
      const failed = await finalizeAgentRun({
        id: run.id,
        status: "failed",
        conversationId,
        error,
      });
      dispatch(runUpserted({ run: failed }));
    } catch {
      /* swallow */
    }
    return { status: "failed", runId: run.id, error };
  }

  // Persist the cleaned segment + supersede prior overlapping rows.
  let segment;
  try {
    segment = await applyCleanupRun({
      sessionId,
      runId: run.id,
      passIndex,
      tStart: window.replaceFromTime,
      tEnd: window.replaceToTime ?? window.replaceFromTime,
      text: cleanedText,
      triggerCause,
    });
    dispatch(cleanedSegmentApplied({ sessionId, segment }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to persist cleaned segment";
    try {
      const failed = await finalizeAgentRun({
        id: run.id,
        status: "failed",
        conversationId,
        error: message,
      });
      dispatch(runUpserted({ run: failed }));
    } catch {
      /* swallow */
    }
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
    // The cleaned segment landed; failing to flip the run row to "complete"
    // is non-fatal. The status will appear stuck at "running" until the
    // next list refresh.
  }

  return { status: "complete", runId: run.id, cleanedSegmentId: segment.id };
});
