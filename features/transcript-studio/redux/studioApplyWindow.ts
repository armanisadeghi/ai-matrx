/**
 * studioApplyWindow — the ONE thing a reattaching tab cannot re-derive.
 *
 * ## Why this exists
 *
 * `reattachStudioRun.ts` rejoins a pass that was still running when the page
 * reloaded and hands back its finished text. Until this module, a Transcript
 * Studio pass could only READ that text: the pass's replace-window
 * (`replaceFromTime` / `passIndex` / the module's parse context) is computed
 * from LIVE Redux state at launch, so a tab that arrived after the fact had no
 * honest way to turn the recovered text into a cleaned / concept / module
 * segment. The row settled `failed` with a true sentence, and the user paid for
 * a full re-run.
 *
 * The fix is one write, not a redesign — exactly the shape the cleanup pad
 * already uses with `metadata.target`: stamp the window onto
 * `studio_runs.metadata.apply` at LAUNCH, and replay it on reattach. The apply
 * functions below are the SAME persistence calls the live path makes
 * (`applyCleanupRun` / `insertConceptItems` / `insertModuleSegments` plus their
 * slice actions) — never a second write path.
 *
 * A run with no `apply` window (an older row, or a surface that owns its own
 * routing like the cleanup pad's `metadata.target`) resolves to `undefined`,
 * and `reattachStudioRun` settles it honestly as before.
 */

import type { AppDispatch } from "@/lib/redux/store";
import {
  applyCleanupRun,
  insertConceptItems,
  insertModuleSegments,
} from "../service/studioService";
import { parseConceptResponse, stripResumeMarker } from "../service/agentScopeBuilder";
import { getModule } from "../modules/registry";
import type { AgentRun, ModuleId, TriggerCause } from "../types";
import {
  cleanedSegmentApplied,
  conceptsAppended,
  moduleSegmentsAppended,
} from "./slice";

/**
 * Everything a pass needs to persist its own output, captured at launch.
 * Stored at `studio_runs.metadata.apply`; a JSON object, so keep it primitive.
 */
export type StudioApplyWindow =
  | {
      kind: "cleaned";
      passIndex: number;
      tStart: number;
      tEnd: number;
      triggerCause: TriggerCause;
      /** Set by the recording-aligned cleaner (Scribe) — scopes supersession. */
      recordingSegmentId?: string | null;
      processorKey?: string;
    }
  | { kind: "concept"; passIndex: number }
  | {
      kind: "module";
      moduleId: ModuleId;
      passIndex: number;
      windowStart: number;
      windowEnd: number;
    };

/** The metadata payload a pass thunk stamps on its run row at launch. */
export function applyWindowMetadata(
  window: StudioApplyWindow,
): Record<string, unknown> {
  return { apply: window };
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Read the stamped window back off a run row. Returns null for anything that
 * is not a complete, well-formed window — a half-written window must never
 * produce a segment placed at a guessed time.
 */
export function studioApplyWindow(run: AgentRun): StudioApplyWindow | null {
  const raw = run.metadata?.apply;
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Record<string, unknown>;
  switch (w.kind) {
    case "cleaned":
      if (!isNumber(w.passIndex) || !isNumber(w.tStart) || !isNumber(w.tEnd)) {
        return null;
      }
      if (typeof w.triggerCause !== "string") return null;
      return {
        kind: "cleaned",
        passIndex: w.passIndex,
        tStart: w.tStart,
        tEnd: w.tEnd,
        triggerCause: w.triggerCause as TriggerCause,
        recordingSegmentId:
          typeof w.recordingSegmentId === "string" ? w.recordingSegmentId : null,
        processorKey:
          typeof w.processorKey === "string" ? w.processorKey : undefined,
      };
    case "concept":
      if (!isNumber(w.passIndex)) return null;
      return { kind: "concept", passIndex: w.passIndex };
    case "module":
      if (
        typeof w.moduleId !== "string" ||
        !isNumber(w.passIndex) ||
        !isNumber(w.windowStart) ||
        !isNumber(w.windowEnd)
      ) {
        return null;
      }
      return {
        kind: "module",
        moduleId: w.moduleId,
        passIndex: w.passIndex,
        windowStart: w.windowStart,
        windowEnd: w.windowEnd,
      };
    default:
      return null;
  }
}

/**
 * Build the `applyRecoveredOutput` callback for a run, or `undefined` when the
 * row carries no replayable window (which is `reattachStudioRun`'s signal to
 * settle honestly instead of inventing a segment).
 *
 * Throwing is the correct failure here: `reattachStudioRun` catches it, screams
 * through `captureError`, settles the row `failed`, and leaves the text
 * readable in the run window.
 */
export function studioApplyRecoveredOutput(
  dispatch: AppDispatch,
  run: AgentRun,
): ((text: string) => Promise<void>) | undefined {
  const window = studioApplyWindow(run);
  if (!window) return undefined;
  const sessionId = run.sessionId;

  if (window.kind === "cleaned") {
    return async (text: string) => {
      const cleanedText = stripResumeMarker(text);
      if (!cleanedText) {
        throw new Error(
          "The recovered pass had no cleaned text after stripping its resume marker.",
        );
      }
      const segment = await applyCleanupRun({
        sessionId,
        runId: run.id,
        passIndex: window.passIndex,
        tStart: window.tStart,
        tEnd: window.tEnd,
        text: cleanedText,
        triggerCause: window.triggerCause,
        recordingSegmentId: window.recordingSegmentId ?? null,
        processorKey: window.processorKey,
      });
      dispatch(cleanedSegmentApplied({ sessionId, segment }));
    };
  }

  if (window.kind === "concept") {
    return async (text: string) => {
      const parsed = parseConceptResponse(text);
      // An empty list is a VALID outcome (the agent found nothing above noise)
      // — same verdict the live path reaches. Applying nothing is success.
      if (parsed.length === 0) return;
      const inserted = await insertConceptItems(
        parsed.map((p) => ({
          sessionId,
          runId: run.id,
          passIndex: window.passIndex,
          kind: p.kind,
          label: p.label,
          description: p.description,
          tStart: p.tStart,
          tEnd: p.tEnd,
        })),
      );
      dispatch(conceptsAppended({ sessionId, items: inserted }));
    };
  }

  return async (text: string) => {
    const moduleDef = getModule(window.moduleId);
    if (!moduleDef) {
      throw new Error(
        `The "${window.moduleId}" module is no longer registered, so this pass could not be restored.`,
      );
    }
    const parsed = moduleDef.parseRun(text, {
      passIndex: window.passIndex,
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
    });
    if (parsed === null) {
      throw new Error("The module parser rejected the recovered response.");
    }
    if (parsed.length === 0) return;
    const inserted = await insertModuleSegments(
      parsed.map((p) => ({
        sessionId,
        runId: run.id,
        passIndex: window.passIndex,
        moduleId: window.moduleId,
        blockType: moduleDef.blockType,
        tStart: p.tStart,
        tEnd: p.tEnd,
        payload: p.payload,
      })),
    );
    dispatch(moduleSegmentsAppended({ sessionId, segments: inserted }));
  };
}
