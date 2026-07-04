// features/flashcards/fast-fire/agents/grading-core.ts
//
// The REUSABLE spoken-answer grading core — the one path every voice interaction
// runs through: FastFire drills today, and the single-card "test me", debate
// practice, and role-play surfaces coming next. It is deliberately decoupled from
// any Redux slice: it takes an audio clip + prompt, drives the grader agent, and
// RETURNS a structured grade. Callers own their own UI state.
//
// The grading contract (audio → structured grade) is the platform's crown jewel;
// keeping it in one primitive means every new "speak your answer" surface inherits
// the hardening (no-audio guard, durable upload, robust extraction) for free.
//
// (FastFire's own `gradeCard.thunk` predates this and keeps its inline copy for
// now to avoid churn on the just-stabilized drill; it can adopt this later.)

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { fileHandler } from "@/features/files";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import { executeInstance } from "@/features/agents/redux/execution-system/thunks/execute-instance.thunk";
import { setUserInputMessageParts } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import {
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import {
  audioExtensionForType,
  normalizeAudioContentType,
} from "@/features/audio/utils/audio-mime";
import type { SourceFeature } from "@/features/agents/types/instance.types";

export type SpokenResult = "correct" | "partial" | "incorrect";

export interface SpokenGradeRubric {
  accuracy: number;
  completeness: number;
  clarity: number;
}

export interface SpokenGrade {
  result: SpokenResult;
  /** Normalized 0..1. */
  score: number;
  rubric: SpokenGradeRubric;
  transcript: string;
  feedback: string;
  missing: string[];
}

/** Narrow the grader's unknown extracted object to a SpokenGrade (never throws). */
export function coerceSpokenGrade(raw: unknown): SpokenGrade | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const resultRaw = str(r.result);
  const score = Math.min(1, Math.max(0, num(r.score, 0)));
  const result: SpokenResult =
    resultRaw === "correct" || resultRaw === "partial" || resultRaw === "incorrect"
      ? resultRaw
      : score >= 0.8
        ? "correct"
        : score >= 0.4
          ? "partial"
          : "incorrect";
  const rubricRaw = (r.rubric as Record<string, unknown>) ?? {};
  return {
    result,
    score,
    rubric: {
      accuracy: num(rubricRaw.accuracy, 0),
      completeness: num(rubricRaw.completeness, 0),
      clarity: num(rubricRaw.clarity, 0),
    },
    transcript: str(r.transcript),
    feedback: str(r.audio_feedback) || str(r.feedback),
    missing: Array.isArray(r.missing)
      ? r.missing.filter((x): x is string => typeof x === "string")
      : [],
  };
}

/** Poll the JSON extractor until it finalizes (or the stream errors). */
async function waitForExtraction(
  getState: () => RootState,
  requestId: string,
  timeoutMs = 120_000,
  intervalMs = 200,
): Promise<unknown | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = getState();
    if (selectJsonExtractionComplete(requestId)(state)) {
      return selectFirstExtractedObject(requestId)(state)?.value ?? null;
    }
    if (selectRequestStatus(requestId)(state) === "error") {
      return selectFirstExtractedObject(requestId)(state)?.value ?? null;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

/** Upload a response clip → durable file_id (or null on missing/failed). Never throws. */
export async function uploadResponseClip(
  clip: Blob | null,
  opts: {
    folderPath: string;
    metadata?: Record<string, unknown>;
    /** Optional stable id for the filename (matches gradeCard.thunk). */
    cardId?: string;
  },
): Promise<string | null> {
  if (!clip || clip.size === 0) return null;
  try {
    const mime = normalizeAudioContentType(clip.type || "audio/wav");
    const ext = audioExtensionForType(mime);
    const namePrefix = opts.cardId ? `fastfire-${opts.cardId}` : "answer";
    const uploaded = await fileHandler.upload(
      { kind: "blob", blob: clip, fileName: `${namePrefix}.${ext}`, mime },
      { folderPath: opts.folderPath, visibility: "private", metadata: opts.metadata ?? {} },
    );
    return uploaded.fileId ?? null;
  } catch (err) {
    console.error("[grading-core] clip upload failed:", err);
    return null;
  }
}

export interface RunSpokenGraderArgs {
  agentId: string;
  front: string;
  back: string;
  secondsAllowed: number;
  /** A durable file_id for the recorded answer (REQUIRED — never grade w/o audio). */
  responseAudioFileId: string;
  rubric?: string;
  surfaceKey: string;
  sourceFeature: SourceFeature;
}

/**
 * Drive the grader agent for ONE spoken answer and return the structured grade.
 * Launches (autoRun:false), attaches the audio as a message part, executes, waits
 * for the JSON, and coerces. Returns null on any failure. Never records anything
 * or touches a slice — the caller owns persistence + UI.
 */
export function runSpokenGrader(args: RunSpokenGraderArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<SpokenGrade | null> => {
    let conversationId: string | null = null;
    try {
      const launch = await dispatch(
        launchAgentExecution({
          agentId: args.agentId,
          surfaceKey: args.surfaceKey,
          // Persisted (not ephemeral — that path 404s the v2 gate) but kept out of
          // the user's normal chats via the system-marked source_feature.
          sourceFeature: args.sourceFeature,
          isEphemeral: false,
          runtime: {
            variables: {
              front: args.front,
              back: args.back,
              seconds_allowed: args.secondsAllowed,
              ...(args.rubric ? { rubric: args.rubric } : {}),
            },
          },
          config: { autoRun: false, displayMode: "background" },
          jsonExtraction: { enabled: true, fuzzyOnFinalize: true },
        }),
      ).unwrap();
      conversationId = launch.conversationId;

      const part = await fileHandler.toContentPart({
        kind: "file_id",
        fileId: args.responseAudioFileId,
      });
      dispatch(setUserInputMessageParts({ conversationId, parts: [part] }));

      const exec = await dispatch(executeInstance({ conversationId })).unwrap();
      const requestId = exec.requestId;
      if (!requestId) throw new Error("grader returned no request id");

      return coerceSpokenGrade(await waitForExtraction(getState, requestId));
    } catch (err) {
      console.error(`[grading-core] runSpokenGrader (${args.surfaceKey}):`, err);
      return null;
    } finally {
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    }
  };
}
