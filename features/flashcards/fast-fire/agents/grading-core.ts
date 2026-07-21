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
import {
  verdictFromResult,
  resultFromScore,
  type GradeVerdict,
  type GradeResult,
} from "@/features/education/trust/types";

export interface SpokenGradeRubric {
  accuracy: number;
  completeness: number;
  clarity: number;
}

/**
 * The pronunciation / language-fluency dimensions — present ONLY when a spoken
 * surface grades HOW something was said (the Spoken Practice "Language &
 * Pronunciation" mode), never on a content-only spoken drill. It rides on the
 * SAME `SpokenGrade` adapter (never a forked grade type): content correctness
 * stays in `verdict` + `rubric`, and these four assess delivery.
 *
 * HONEST GRANULARITY: our STT yields a transcript, not phoneme scores. These are
 * the grader's HOLISTIC, word/syllable-level judgement of the recording — NOT
 * phoneme-perfect, IPA-exact, or per-phoneme measurements. The UI must present
 * them that way; do not imply a precision the pipeline can't deliver.
 */
export interface PronunciationAssessment {
  /** How correctly the sounds/words were pronounced for the target language. */
  accuracy: number;
  /** Pacing, smoothness, absence of long hesitation. */
  fluency: number;
  /** How easily a fluent listener would understand it. */
  intelligibility: number;
  /** Intonation, word stress, rhythm appropriate to the target language. */
  prosody: number;
  /** 1-2 sentences of honest, transcript-level pronunciation coaching. */
  notes: string;
}

/**
 * The spoken-answer grade — a THIN ADAPTER around the canonical `GradeVerdict`
 * core (correct/partial/misconception/explanation), carrying the spoken-only
 * extras (continuous score, speaking rubric, transcript, what was missing). The
 * grader's textual feedback IS the verdict's `explanation`; the pass/partial/
 * fail token is `verdictResult(verdict)`. Never a second verdict shape.
 */
export interface SpokenGrade {
  verdict: GradeVerdict;
  /** Normalized 0..1 (rubric-derived; spoken keeps a continuous score). */
  score: number;
  rubric: SpokenGradeRubric;
  transcript: string;
  /** Points the learner missed, per the grader. */
  missing: string[];
  /**
   * Pronunciation / fluency dimensions — populated only when the grader scores
   * delivery (Language & Pronunciation mode); null for content-only drills.
   */
  pronunciation: PronunciationAssessment | null;
}

/** Narrow the grader's optional `pronunciation` object (null when absent/empty). */
function coercePronunciation(raw: unknown): PronunciationAssessment | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  const n = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
  const hasSignal =
    typeof p.accuracy === "number" ||
    typeof p.fluency === "number" ||
    typeof p.intelligibility === "number" ||
    typeof p.prosody === "number" ||
    typeof p.notes === "string";
  if (!hasSignal) return null;
  return {
    accuracy: n(p.accuracy),
    fluency: n(p.fluency),
    intelligibility: n(p.intelligibility),
    prosody: n(p.prosody),
    notes: typeof p.notes === "string" ? p.notes : "",
  };
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
  const result: GradeResult =
    resultRaw === "correct" || resultRaw === "partial" || resultRaw === "incorrect"
      ? resultRaw
      : resultFromScore(score);
  const rubricRaw = (r.rubric as Record<string, unknown>) ?? {};
  const explanation = str(r.audio_feedback) || str(r.feedback);
  const misconception = str(r.misconception) || null;
  return {
    verdict: verdictFromResult(result, explanation, misconception),
    score,
    rubric: {
      accuracy: num(rubricRaw.accuracy, 0),
      completeness: num(rubricRaw.completeness, 0),
      clarity: num(rubricRaw.clarity, 0),
    },
    transcript: str(r.transcript),
    missing: Array.isArray(r.missing)
      ? r.missing.filter((x): x is string => typeof x === "string")
      : [],
    pronunciation: coercePronunciation(r.pronunciation),
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
      { folderPath: opts.folderPath, visibility: "personal", metadata: opts.metadata ?? {} },
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
