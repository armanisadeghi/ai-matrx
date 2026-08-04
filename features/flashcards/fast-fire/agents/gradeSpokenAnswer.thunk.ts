// features/flashcards/fast-fire/agents/gradeSpokenAnswer.thunk.ts
//
// Grade ONE spoken answer, end to end, and RETURN the result — the reusable entry
// any standalone voice surface calls (single-card "test me", and later debate /
// role-play). Unlike FastFire's fire-and-forget `gradeCard`, this AWAITS and hands
// the grade back so a self-contained UI can show it immediately. It still records
// the attempt on the shared study spine (so it counts toward mastery) when an item
// is provided.
//
// Reuses the decoupled `grading-core` (upload + grader + coerce) so every voice
// surface inherits the same hardened path.

import type { AppDispatch } from "@/lib/redux/store";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import { verdictResult } from "@/features/education/trust/types";
import { studyService } from "@/features/education/study/service/studyService";
import { getFastFireAgentConfig } from "../config";
import {
  runSpokenGrader,
  uploadResponseClip,
  type SpokenGrade,
} from "./grading-core";

export interface GradeSpokenAnswerArgs {
  front: string;
  back: string;
  secondsAllowed: number;
  clip: Blob | null;
  rubric?: string;
  /** Record the attempt on the study spine when both are set (else grade-only). */
  itemType?: string;
  itemId?: string;
  method?: string;
  sessionId?: string | null;
  /** For telemetry / folder labelling. */
  surface?: string;
}

export interface GradeSpokenAnswerResult {
  status: "graded" | "skipped" | "error";
  grade?: SpokenGrade;
  responseAudioFileId: string | null;
  error?: string;
}

export function gradeSpokenAnswer(args: GradeSpokenAnswerArgs) {
  return async (dispatch: AppDispatch): Promise<GradeSpokenAnswerResult> => {
    try {
      const config = getFastFireAgentConfig();
      const surface = args.surface ?? "voice-test";

      // Same upload path as gradeCard.thunk — best-effort; a failed upload must
      // never throw (FastFire skips grading and records result-less instead).
      const responseAudioFileId = await uploadResponseClip(args.clip, {
        folderPath: CloudFolders.SYSTEM_FASTFIRE_RESPONSES,
        metadata: {
          origin: surface,
          item_type: args.itemType ?? null,
          item_id: args.itemId ?? null,
          session_id: args.sessionId ?? null,
          ...(args.itemId ? { card_id: args.itemId } : {}),
        },
        ...(args.itemId ? { cardId: args.itemId } : {}),
      });

      if (!config.graderAgentId || !responseAudioFileId) {
        await maybeRecord(args, responseAudioFileId, null, null);
        return {
          status: "skipped",
          responseAudioFileId,
          ...(responseAudioFileId
            ? {}
            : {
                error:
                  args.clip && args.clip.size > 0
                    ? "Could not upload your recording — check your connection and try again."
                    : undefined,
              }),
        };
      }

      const grade = await dispatch(
        runSpokenGrader({
          agentId: config.graderAgentId,
          front: args.front,
          back: args.back,
          secondsAllowed: args.secondsAllowed,
          responseAudioFileId,
          ...(args.rubric ? { rubric: args.rubric } : {}),
          surfaceKey: `${surface}-grade`,
          sourceFeature: "education-fastfire",
        }),
      );

      if (!grade) {
        await maybeRecord(
          args,
          responseAudioFileId,
          null,
          config.graderAgentId,
        );
        return {
          status: "error",
          responseAudioFileId,
          error: "The grader didn't return a result.",
        };
      }

      await maybeRecord(args, responseAudioFileId, grade, config.graderAgentId);
      return { status: "graded", grade, responseAudioFileId };
    } catch (err) {
      console.error("[gradeSpokenAnswer] unexpected failure:", err);
      return {
        status: "error",
        responseAudioFileId: null,
        error:
          err instanceof Error
            ? err.message
            : "Something went wrong grading that answer.",
      };
    }
  };
}

/** Record the attempt on the shared spine when an item is provided. Loud on error. */
async function maybeRecord(
  args: GradeSpokenAnswerArgs,
  responseAudioFileId: string | null,
  grade: SpokenGrade | null,
  gradedBy: string | null,
): Promise<void> {
  if (!args.itemType || !args.itemId) return;
  const res = await studyService.recordAttempt({
    itemType: args.itemType,
    itemId: args.itemId,
    method: args.method ?? "voice_test",
    responseKind: "spoken",
    ...(args.sessionId ? { sessionId: args.sessionId } : {}),
    ...(grade ? { result: verdictResult(grade.verdict) } : {}),
    ...(grade ? { scoreValue: grade.score } : {}),
    ...(grade
      ? {
          score: {
            rubric: grade.rubric,
            missing: grade.missing,
            feedback: grade.verdict.explanation,
          },
        }
      : {}),
    ...(responseAudioFileId ? { responseAudioFileId } : {}),
    ...(grade?.transcript ? { responseTranscript: grade.transcript } : {}),
    ...(gradedBy ? { gradedBy } : {}),
  });
  if (res.error) {
    console.error("[gradeSpokenAnswer] recordAttempt failed:", res.error);
  }
}
