/**
 * runConceptPassThunk — Column 3's pipeline.
 *
 * Mirrors `runCleaningPassThunk` but with two key differences:
 *   1. Output is a LIST of items, not one text blob. We parse a JSON code
 *      fence from the agent response into typed concept items.
 *   2. Concepts are append-only — no supersede pass. Each run adds N items
 *      to the registry; previous items stay put. Time anchors are optional.
 *
 * Pipeline:
 *   1. Build the concept window — raw text (or cleaned where available)
 *      strictly after `lastConceptCoverageTEnd`. Idempotent skip when empty.
 *   2. Insert a `studio_runs` row (status='running').
 *   3. Dispatch `launchAgentExecution` with displayMode='background'.
 *   4. Parse JSON from the response. Validate each item.
 *   5. Bulk-insert items into `studio_concept_items`. Append in Redux.
 *   6. Finalize the run row.
 *
 * The "last concept coverage" boundary is derived from the most recent
 * SUCCESSFUL Column 3 run's `input_char_range` end. We store this on the
 * run row at insert time so a follow-up tick can read it without rebuilding
 * from item time anchors (which are optional and may be missing).
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  finalizeAgentRun,
  insertAgentRun,
  insertConceptItems,
} from "../service/studioService";
import {
  buildConceptWindow,
  parseConceptResponse,
} from "../service/agentScopeBuilder";
import { DEFAULT_CONCEPT_SHORTCUT_ID } from "../constants";
import type { TriggerCause } from "../types";
import { conceptsAppended, runUpserted } from "./slice";

interface RunConceptPassArgs {
  sessionId: string;
  triggerCause: TriggerCause;
  shortcutId?: string;
}

export type RunConceptPassResult =
  | { status: "skipped"; reason: "no-new-raw" | "no-session" }
  | { status: "complete"; runId: string; insertedCount: number }
  | { status: "failed"; runId: string | null; error: string };

export const runConceptPassThunk = createAsyncThunk<
  RunConceptPassResult,
  RunConceptPassArgs,
  { state: RootState }
>("transcriptStudio/runConceptPass", async (args, { dispatch, getState }) => {
  const { sessionId, triggerCause } = args;
  const shortcutId = args.shortcutId ?? DEFAULT_CONCEPT_SHORTCUT_ID;

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

  const conceptIds = state.transcriptStudio.conceptIdsBySession[sessionId] ?? [];
  const conceptItems = conceptIds
    .map((id) => state.transcriptStudio.conceptsById[sessionId]?.[id])
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  // Find the last successful concept run's coverage boundary. We stamp this
  // on the run row's `input_char_range` so we can recover it without rebuilding
  // from item time anchors.
  const runIds = state.transcriptStudio.runIdsBySession[sessionId] ?? [];
  let lastConceptCoverageTEnd = 0;
  for (let i = runIds.length - 1; i >= 0; i--) {
    const r = state.transcriptStudio.runsById[sessionId]?.[runIds[i]!];
    if (
      r &&
      r.columnIdx === 3 &&
      r.status === "complete" &&
      r.inputCharRange
    ) {
      // We stash the coverage tEnd as the second char-range value (interpreted
      // as a fixed-point number * 1000) — see insertAgentRun below.
      lastConceptCoverageTEnd = r.inputCharRange[1] / 1000;
      break;
    }
  }

  const window = buildConceptWindow({
    rawSegments,
    cleanedSegments,
    conceptItems,
    lastConceptCoverageTEnd,
    session,
  });

  if (!window.rawWindow || window.windowEndTime === null) {
    return { status: "skipped", reason: "no-new-raw" };
  }

  // Stamp [start_ms, end_ms] (ms-as-int) so we can recover the coverage
  // boundary on subsequent ticks.
  const coverageStart = Math.round((window.windowStartTime ?? 0) * 1000);
  const coverageEnd = Math.round(window.windowEndTime * 1000);

  let run;
  try {
    run = await insertAgentRun({
      sessionId,
      columnIdx: 3,
      shortcutId,
      triggerCause,
      inputCharRange: [coverageStart, coverageEnd],
    });
    dispatch(runUpserted({ run }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record run";
    return { status: "failed", runId: null, error: message };
  }

  // Compute pass index (monotonic per session per column).
  const lastConceptPassIndex = conceptItems.reduce(
    (max, c) => (c.passIndex > max ? c.passIndex : max),
    -1,
  );
  const passIndex = lastConceptPassIndex + 1;

  let conversationId: string | null = null;
  let responseText: string | undefined;

  try {
    const result = (await dispatch(
      launchAgentExecution({
        shortcutId,
        surfaceKey: `studio:concepts:${sessionId}`,
        sourceFeature: "transcription",
        runtime: { applicationScope: window.scope },
        config: { displayMode: "background", autoRun: true },
      }),
    ).unwrap()) as {
      conversationId: string;
      responseText?: string;
    };
    conversationId = result.conversationId ?? null;
    responseText = result.responseText;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Concept agent invocation failed";
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

  if (!responseText || !responseText.trim()) {
    const error = "Concept agent returned an empty response";
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

  const parsed = parseConceptResponse(responseText);
  // Empty array is a VALID outcome — the agent reviewed the window and
  // decided nothing rose above noise. Mark the run complete and exit.
  if (parsed.length === 0) {
    try {
      const finalized = await finalizeAgentRun({
        id: run.id,
        status: "complete",
        conversationId,
      });
      dispatch(runUpserted({ run: finalized }));
    } catch {
      /* swallow */
    }
    return { status: "complete", runId: run.id, insertedCount: 0 };
  }

  // Persist the items.
  let inserted;
  try {
    inserted = await insertConceptItems(
      parsed.map((p) => ({
        sessionId,
        runId: run.id,
        passIndex,
        kind: p.kind,
        label: p.label,
        description: p.description,
        tStart: p.tStart,
        tEnd: p.tEnd,
      })),
    );
    dispatch(conceptsAppended({ sessionId, items: inserted }));
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to persist concept items";
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
    /* swallow */
  }

  return { status: "complete", runId: run.id, insertedCount: inserted.length };
});
