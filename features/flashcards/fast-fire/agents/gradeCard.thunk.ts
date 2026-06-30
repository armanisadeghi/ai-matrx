// features/flashcards/fast-fire/agents/gradeCard.thunk.ts
//
// FIRE-AND-FORGET grading (REQUIREMENTS §7, hard-requirement #4). The drill loop
// NEVER awaits this. For each card, the moment its window closes we:
//   1. upload the per-card clip → durable file_id (fileHandler.upload),
//   2. launch the grader agent (autoRun:false) → conversationId,
//   3. seed the audio as a message part (toContentPart + setUserInputMessageParts),
//   4. executeInstance → requestId,
//   5. poll selectFirstExtractedObject(requestId) for the json_schema object,
//   6. dispatch `gradeResolved` INTO Redux (the grade reaches the UI ONLY this
//      way — never a same-tick re-read of state set elsewhere; the §5.3 killer
//      bug is structurally impossible),
//   7. record the attempt on the study spine (study_record_attempt).
//
// GRADER-OPTIONAL (hard-requirement #6): if no grader agent id is configured, we
// STILL upload the clip + record a result-less attempt (so the mechanics are
// testable now) and mark the grade `skipped`. Grading lights up the instant an
// id is set in config.ts.
//
// Keyed by the STABLE card id throughout, so grades land on the right card even
// though they resolve out of order, long after the drill advanced past them.

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
import { studyService } from "@/features/education/study/service/studyService";
import { getFastFireAgentConfig } from "../config";
import {
  gradePending,
  gradeResolved,
  gradeSkipped,
  gradeFailed,
  type GradeResult,
  type GradeRubric,
} from "../redux/fastFireSlice";
import { FC_GRADE_SPOKEN_SCHEMA } from "./schemas";

const FC_CARD_ITEM_TYPE = "fc_card";
const FAST_FIRE_METHOD = "fast_fire";

export interface GradeCardArgs {
  cardId: string;
  front: string;
  back: string;
  secondsAllowed: number;
  /** The per-card response clip assembled from the continuous stream. */
  clip: Blob | null;
  sessionId: string | null;
}

/** Narrow an unknown extracted object to the fc_grade_spoken shape. */
function coerceGrade(raw: unknown): {
  score: number;
  result: GradeResult;
  rubric: GradeRubric;
  transcript: string;
  feedback: string;
  missing: string[];
} | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const resultRaw = str(r.result);
  const result: GradeResult =
    resultRaw === "correct" || resultRaw === "partial" || resultRaw === "incorrect"
      ? resultRaw
      : num(r.score, 0) >= 0.8
        ? "correct"
        : num(r.score, 0) >= 0.4
          ? "partial"
          : "incorrect";
  const rubricRaw = (r.rubric as Record<string, unknown>) ?? {};
  return {
    score: Math.min(1, Math.max(0, num(r.score, 0))),
    result,
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

/** Wait for the json extractor to finalize, then read the first object. */
async function waitForGrade(
  getState: () => RootState,
  requestId: string,
  timeoutMs = 120_000,
  intervalMs = 200,
): Promise<unknown | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = getState();
    const status = selectRequestStatus(requestId)(state);
    if (selectJsonExtractionComplete(requestId)(state)) {
      const snap = selectFirstExtractedObject(requestId)(state);
      return snap?.value ?? null;
    }
    if (status === "error") {
      // Stream errored without producing JSON — try one last read, else give up.
      const snap = selectFirstExtractedObject(requestId)(state);
      return snap?.value ?? null;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

/**
 * Grade one card. Returns nothing the drill needs — its whole job is the Redux
 * dispatches + the attempt record. Call it WITHOUT awaiting from the drill loop.
 */
export function gradeCard(args: GradeCardArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<void> => {
    const { cardId, front, back, secondsAllowed, clip, sessionId } = args;
    const config = getFastFireAgentConfig();

    // 1. Upload the per-card clip to a durable file_id (best-effort — a missing
    //    clip is not fatal; we still record the attempt result-less).
    let responseAudioFileId: string | null = null;
    if (clip && clip.size > 0) {
      try {
        const uploaded = await fileHandler.upload(
          { kind: "blob", blob: clip, fileName: `fastfire-${cardId}.webm`, mime: clip.type || "audio/webm" },
          { folderPath: "FastFire/responses", visibility: "private" },
        );
        responseAudioFileId = uploaded.fileId ?? null;
      } catch (err) {
        console.error("[fastfire.gradeCard] clip upload failed:", err);
      }
    }

    // GRADER-OPTIONAL: no agent → record a result-less attempt and mark skipped.
    if (!config.graderAgentId) {
      dispatch(gradeSkipped({ cardId, responseAudioFileId }));
      await recordAttempt({
        cardId,
        sessionId,
        responseAudioFileId,
        result: null,
        scoreValue: null,
        score: null,
        transcript: null,
        gradedBy: null,
      });
      return;
    }

    dispatch(gradePending({ cardId, responseAudioFileId }));

    let conversationId: string | null = null;
    try {
      // 2. Launch the grader (autoRun:false so we can attach audio first).
      const launch = await dispatch(
        launchAgentExecution({
          agentId: config.graderAgentId,
          surfaceKey: `fastfire-grade-${cardId}`,
          sourceFeature: "flashcards",
          isEphemeral: true,
          runtime: {
            variables: {
              front,
              back,
              seconds_allowed: secondsAllowed,
            },
          },
          config: {
            autoRun: false,
            displayMode: "background",
            llmOverrides: { response_format: FC_GRADE_SPOKEN_SCHEMA },
          },
          jsonExtraction: { enabled: true, fuzzyOnFinalize: true },
        }),
      ).unwrap();
      conversationId = launch.conversationId;

      // 3. Seed the audio clip as a message part (NOT userInput — that's a string).
      if (responseAudioFileId) {
        const part = await fileHandler.toContentPart({
          kind: "file_id",
          fileId: responseAudioFileId,
        });
        dispatch(setUserInputMessageParts({ conversationId, parts: [part] }));
      }

      // 4. Run it and capture the requestId.
      const exec = await dispatch(executeInstance({ conversationId })).unwrap();
      const requestId = exec.requestId;
      if (!requestId) throw new Error("grader returned no request id");

      // 5. Poll for the structured grade.
      const raw = await waitForGrade(getState, requestId);
      const grade = coerceGrade(raw);
      if (!grade) throw new Error("grader did not return a structured grade");

      // 6. Into Redux — the ONLY way the grade reaches the UI.
      dispatch(
        gradeResolved({
          cardId,
          score: grade.score,
          result: grade.result,
          rubric: grade.rubric,
          transcript: grade.transcript,
          feedback: grade.feedback,
          missing: grade.missing,
        }),
      );

      // 7. Record the attempt on the study spine.
      await recordAttempt({
        cardId,
        sessionId,
        responseAudioFileId,
        result: grade.result,
        scoreValue: grade.score,
        score: { rubric: grade.rubric, missing: grade.missing, feedback: grade.feedback },
        transcript: grade.transcript || null,
        gradedBy: config.graderAgentId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "grading failed";
      console.error(`[fastfire.gradeCard] card ${cardId}:`, err);
      dispatch(gradeFailed({ cardId, error: message }));
      // Still record the attempt (result-less) so the response audio + session
      // are not lost just because the grade failed.
      await recordAttempt({
        cardId,
        sessionId,
        responseAudioFileId,
        result: null,
        scoreValue: null,
        score: { grade_error: message },
        transcript: null,
        gradedBy: config.graderAgentId,
      });
    } finally {
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    }
  };
}

/** Thin wrapper around the canonical attempt writer. Loud on error. */
async function recordAttempt(input: {
  cardId: string;
  sessionId: string | null;
  responseAudioFileId: string | null;
  result: GradeResult | null;
  scoreValue: number | null;
  score: Record<string, unknown> | null;
  transcript: string | null;
  gradedBy: string | null;
}): Promise<void> {
  const res = await studyService.recordAttempt({
    itemType: FC_CARD_ITEM_TYPE,
    itemId: input.cardId,
    method: FAST_FIRE_METHOD,
    responseKind: "spoken",
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.result ? { result: input.result } : {}),
    ...(input.scoreValue !== null ? { scoreValue: input.scoreValue } : {}),
    ...(input.score ? { score: input.score } : {}),
    ...(input.responseAudioFileId
      ? { responseAudioFileId: input.responseAudioFileId }
      : {}),
    ...(input.transcript ? { responseTranscript: input.transcript } : {}),
    ...(input.gradedBy ? { gradedBy: input.gradedBy } : {}),
  });
  if (res.error) {
    console.error("[fastfire.gradeCard] recordAttempt failed:", res.error);
  }
}
