// features/flashcards/fast-fire/agents/gradeCard.thunk.ts
//
// FIRE-AND-FORGET grading (REQUIREMENTS §7, hard-requirement #4). The drill loop
// NEVER awaits this. For each card, the moment its window closes we:
//   1. upload the per-card clip → durable file_id (fileHandler.upload),
//   2. run the grader through the canonical headless primitive
//      (`runHeadlessAgentJson`, D126) with the audio as a message part,
//   3. dispatch `gradeResolved` INTO Redux (the grade reaches the UI ONLY this
//      way — never a same-tick re-read of state set elsewhere; the §5.3 killer
//      bug is structurally impossible),
//   4. record the attempt on the study spine (study_record_attempt).
//
// GRADER-OPTIONAL (hard-requirement #6): if no grader agent id is configured, we
// STILL upload the clip + record a result-less attempt (so the mechanics are
// testable now) and mark the grade `skipped`. Grading lights up the instant an
// id is set in config.ts.
//
// Keyed by the STABLE card id throughout, so grades land on the right card even
// though they resolve out of order, long after the drill advanced past them.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { fileHandler } from "@/features/files/handler/handler";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
import { studyService } from "@/features/education/study/service/studyService";
import {
  audioExtensionForType,
  normalizeAudioContentType,
} from "@/features/audio/utils/audio-mime";
import { verdictResult, type GradeResult } from "@/features/education/trust/types";
import { getFastFireAgentConfig } from "../config";
import { coerceSpokenGrade } from "./grading-core";
import {
  gradePending,
  gradeResolved,
  gradeSkipped,
  gradeFailed,
} from "../redux/fastFireSlice";

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

// Coercion of the grader's structured output is the shared `coerceSpokenGrade`
// (grading-core) — the ONE spoken-grade coercer. (This thunk carried a
// byte-for-byte inline copy as deliberate tech debt; deleted at the trust
// unification. FastFire's flat slice payload is built from the adapter below.)

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
        // The capture core emits WAV; derive the extension/mime from the blob
        // itself rather than hard-coding a container, so the cloud-files row is
        // stored as the real audio type (not mislabelled webm/video).
        const mime = normalizeAudioContentType(clip.type || "audio/wav");
        const ext = audioExtensionForType(mime);
        const uploaded = await fileHandler.upload(
          {
            kind: "blob",
            blob: clip,
            fileName: `fastfire-${cardId}.${ext}`,
            mime,
          },
          {
            folderPath: CloudFolders.SYSTEM_FASTFIRE_RESPONSES,
            visibility: "personal",
            metadata: {
              origin: "fastfire",
              session_id: sessionId ?? null,
              card_id: cardId,
            },
          },
        );
        responseAudioFileId = uploaded.fileId ?? null;
      } catch (err) {
        console.error("[fastfire.gradeCard] clip upload failed:", err);
      }
    }

    // GRADER-OPTIONAL + NO-AUDIO GUARD: skip the grader (record result-less) when
    // there's no grader configured OR no audio was captured/uploaded. Grading with
    // NO audio is worse than not grading: the model has nothing to transcribe and
    // hallucinates a "correct" answer from the card back (the exact 100%-on-
    // everything bug). This also makes abort-mid-pad safe — an abandoned card whose
    // clip resolved null never launches a grader or records a fabricated grade.
    if (!config.graderAgentId || !responseAudioFileId) {
      dispatch(gradeSkipped({ cardId, responseAudioFileId, runId: sessionId }));
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

    dispatch(gradePending({ cardId, responseAudioFileId, runId: sessionId }));

    try {
      // 2. Attach the audio as a message part (NOT userInput — that's a string)
      //    and run the grader through the headless primitive.
      const part = await fileHandler.toContentPart({
        kind: "file_id",
        fileId: responseAudioFileId,
      });
      const runResult = await runHeadlessAgentJson(dispatch, getState, {
        agentId: config.graderAgentId,
        surfaceKey: `fastfire-grade-${cardId}`,
        // NOT ephemeral: the platform's ephemeral path is half-built and
        // 404s against the v2 conversation gate (see docs/EPHEMERAL_AGENT_RUNS_SPEC.md).
        // We persist instead, and keep these out of the user's normal chats
        // via a distinct, system-marked source_feature (source-registry.ts).
        sourceFeature: "education-fastfire",
        variables: {
          front,
          back,
          seconds_allowed: secondsAllowed,
        },
        // No response_format override: the grader is OUR agent — its output
        // schema lives in its DB definition (edit it there via agent_author,
        // never a call-time override, which also wrecks the prod agent cache).
        messageParts: [part],
        timeoutMs: 120_000,
        pollIntervalMs: 200,
      });

      // 3. Coerce via the shared spoken coercer (partial-tolerant on error).
      const grade = coerceSpokenGrade(runResult.data);
      if (!grade) throw new Error("grader did not return a structured grade");
      // Flatten the SpokenGrade adapter onto the slice's per-card wire shape:
      // the verdict's result token + explanation, plus the spoken extras.
      const result = verdictResult(grade.verdict);
      const feedback = grade.verdict.explanation;

      // 4. Into Redux — the ONLY way the grade reaches the UI.
      dispatch(
        gradeResolved({
          cardId,
          runId: sessionId,
          score: grade.score,
          result,
          rubric: grade.rubric,
          transcript: grade.transcript,
          feedback,
          missing: grade.missing,
        }),
      );

      // 5. Record the attempt on the study spine (score jsonb shape unchanged:
      //    { rubric, missing, feedback }).
      await recordAttempt({
        cardId,
        sessionId,
        responseAudioFileId,
        result,
        scoreValue: grade.score,
        score: {
          rubric: grade.rubric,
          missing: grade.missing,
          feedback,
        },
        transcript: grade.transcript || null,
        gradedBy: config.graderAgentId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "grading failed";
      console.error(`[fastfire.gradeCard] card ${cardId}:`, err);
      dispatch(gradeFailed({ cardId, error: message, runId: sessionId }));
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
