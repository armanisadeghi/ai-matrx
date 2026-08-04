/**
 * runModulePassThunk — Column 4's pipeline.
 *
 * Generic over modules: looks up the module definition by `session.moduleId`,
 * delegates window-building to `module.buildScope`, invokes the agent via
 * `launchAgentExecution`, and parses the response with `module.parseRun`.
 * Each pass inserts ZERO OR MORE `studio_module_segments` rows tagged with
 * the active `module_id` and the module's `blockType`.
 *
 * Append-only: previous passes' segments stay; mid-session module switches
 * leave them tagged with their original module_id and the active selector
 * filters by the session's current module unless `show_prior_modules` is on.
 *
 * Coverage boundary recovery: same trick as the concept thunk — we stash
 * the window's `[start_ms, end_ms]` as a fixed-point pair on the run row's
 * `input_char_range`, scoped per module_id. The scheduler reads it back to
 * compute the next window.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  finalizeAgentRun,
  insertAgentRun,
  insertModuleSegments,
} from "../service/studioService";
import { getModule } from "../modules/registry";
import type { TriggerCause } from "../types";
import {
  moduleSegmentsAppended,
  runUpserted,
} from "./slice";

interface RunModulePassArgs {
  sessionId: string;
  triggerCause: TriggerCause;
  /** Override the module's default shortcut. Falls back to the registered default. */
  shortcutId?: string;
}

export type RunModulePassResult =
  | {
      status: "skipped";
      reason: "no-new-raw" | "no-session" | "no-module" | "no-shortcut";
    }
  | { status: "complete"; runId: string; insertedCount: number }
  | { status: "failed"; runId: string | null; error: string };

export const runModulePassThunk = createAsyncThunk<
  RunModulePassResult,
  RunModulePassArgs,
  { state: RootState }
>("transcriptStudio/runModulePass", async (args, { dispatch, getState }) => {
  const { sessionId, triggerCause } = args;

  const state = getState();
  const session = state.transcriptStudio.byId[sessionId];
  if (!session) return { status: "skipped", reason: "no-session" };

  const moduleDef = getModule(session.moduleId);
  if (!moduleDef) return { status: "skipped", reason: "no-module" };

  const shortcutId = args.shortcutId ?? moduleDef.defaultShortcutId;
  if (!shortcutId) return { status: "skipped", reason: "no-shortcut" };

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

  // Module segments emitted by EARLIER passes for the CURRENT module.
  const moduleSegmentIds =
    state.transcriptStudio.moduleSegmentIdsBySession[sessionId] ?? [];
  const priorModuleSegments = moduleSegmentIds
    .map((id) => state.transcriptStudio.moduleSegmentsById[sessionId]?.[id])
    .filter(
      (s): s is NonNullable<typeof s> =>
        Boolean(s) && (s as { moduleId: string }).moduleId === session.moduleId,
    );

  // Last successful coverage boundary for THIS module.
  const runIds = state.transcriptStudio.runIdsBySession[sessionId] ?? [];
  let lastModuleCoverageTEnd = 0;
  for (let i = runIds.length - 1; i >= 0; i--) {
    const r = state.transcriptStudio.runsById[sessionId]?.[runIds[i]!];
    if (
      r &&
      r.columnIdx === 4 &&
      r.status === "complete" &&
      r.inputCharRange &&
      r.shortcutId === shortcutId
    ) {
      lastModuleCoverageTEnd = r.inputCharRange[1] / 1000;
      break;
    }
  }

  const scopeResult = moduleDef.buildScope({
    rawSegments,
    cleanedSegments,
    conceptItems,
    priorModuleSegments,
    lastModuleCoverageTEnd,
    session,
  });

  if (
    !scopeResult.hasNewWindow ||
    scopeResult.windowEndTime === null ||
    scopeResult.windowStartTime === null
  ) {
    return { status: "skipped", reason: "no-new-raw" };
  }

  const coverageStart = Math.round(scopeResult.windowStartTime * 1000);
  const coverageEnd = Math.round(scopeResult.windowEndTime * 1000);

  // Audit run row.
  let run;
  try {
    run = await insertAgentRun({
      sessionId,
      columnIdx: 4,
      shortcutId,
      triggerCause,
      inputCharRange: [coverageStart, coverageEnd],
    });
    dispatch(runUpserted({ run }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record run";
    return { status: "failed", runId: null, error: message };
  }

  const lastModulePassIndex = priorModuleSegments.reduce(
    (max, s) => (s.passIndex > max ? s.passIndex : max),
    -1,
  );
  const passIndex = lastModulePassIndex + 1;

  let conversationId: string | null = null;
  let responseText: string | undefined;

  try {
    const result = (await dispatch(
      launchAgentExecution({
        shortcutId,
        surfaceKey: `studio:module:${session.moduleId}:${sessionId}`,
        sourceFeature: "transcription",
        runtime: { applicationScope: scopeResult.scope },
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
      err instanceof Error ? err.message : "Module agent invocation failed";
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
    const error = "Module agent returned an empty response";
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

  const parsed = moduleDef.parseRun(responseText, {
    passIndex,
    windowStart: scopeResult.windowStartTime,
    windowEnd: scopeResult.windowEndTime,
  });
  if (parsed === null) {
    const error = "Module parser rejected the agent response";
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

  let inserted;
  try {
    inserted = await insertModuleSegments(
      parsed.map((p) => ({
        sessionId,
        runId: run.id,
        passIndex,
        moduleId: session.moduleId,
        blockType: moduleDef.blockType,
        tStart: p.tStart,
        tEnd: p.tEnd,
        payload: p.payload,
      })),
    );
    dispatch(moduleSegmentsAppended({ sessionId, segments: inserted }));
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to persist module segments";
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
