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
//
// OFFLINE — THE SPLIT (IC-8), identical to `gradeCard.thunk`: the OBSERVATION
// (this learner answered this item, spoken, at this instant) is queued in the
// study outbox and replays idempotently on reconnect; the GRADE is derived
// state produced by a server agent and is NEVER queued — it cannot be computed
// offline, and `study_record_attempt` is idempotent by id, so it could not be
// attached to the replayed attempt afterwards either. Grade-only calls (no
// `itemType`/`itemId`) have no observation to keep and simply return an error.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import { verdictResult } from "@/features/education/trust/types";
import { recordAttemptOfflineAware } from "@/features/education/study/offline/recordAttemptOffline";
import { FC_MANDATES } from "@/features/flashcards/data/mandates";
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
  /** Canonical `ui_surface.name` of the lane driving this grade (threads into
   *  the shared grader launch so surface bindings resolve). */
  surfaceName?: string;
  /**
   * Watch the grade stream instead of showing a spinner. See
   * `runSpokenGrader` — the caller owns destroying the instance when it stops
   * displaying the run.
   */
  onConversationCreated?: (conversationId: string) => void;
}

export interface GradeSpokenAnswerResult {
  status: "graded" | "skipped" | "error";
  grade?: SpokenGrade;
  responseAudioFileId: string | null;
  error?: string;
}

export function gradeSpokenAnswer(args: GradeSpokenAnswerArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<GradeSpokenAnswerResult> => {
    try {
      const surface = args.surface ?? "voice-test";
      // Whose outbox an offline attempt joins.
      const userId = selectUserId(getState()) ?? "";

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

      if (!responseAudioFileId) {
        // The upload failed — offline, or a genuine upload error. Either way
        // the OBSERVATION still counts, so it goes through the offline-aware
        // writer and lands in the outbox when the cause was the network.
        await maybeRecord(userId, args, responseAudioFileId, null, null);
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
          mandateKey: FC_MANDATES.gradeSpoken,
          front: args.front,
          back: args.back,
          secondsAllowed: args.secondsAllowed,
          responseAudioFileId,
          ...(args.rubric ? { rubric: args.rubric } : {}),
          surfaceKey: `${surface}-grade`,
          sourceFeature: "education-fastfire",
          ...(args.surfaceName ? { surfaceName: args.surfaceName } : {}),
          ...(args.onConversationCreated
            ? { onConversationCreated: args.onConversationCreated }
            : {}),
        }),
      );

      if (!grade) {
        await maybeRecord(
          userId,
          args,
          responseAudioFileId,
          null,
          FC_MANDATES.gradeSpoken,
        );
        return {
          status: "error",
          responseAudioFileId,
          error: "The grader didn't return a result.",
        };
      }

      await maybeRecord(
        userId,
        args,
        responseAudioFileId,
        grade,
        FC_MANDATES.gradeSpoken,
      );
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

/**
 * Record the attempt on the shared spine when an item is provided, through the
 * OFFLINE-AWARE writer so a dropped connection queues the answer instead of
 * discarding it. Loud on error.
 */
async function maybeRecord(
  userId: string,
  args: GradeSpokenAnswerArgs,
  responseAudioFileId: string | null,
  grade: SpokenGrade | null,
  gradedBy: string | null,
): Promise<void> {
  if (!args.itemType || !args.itemId) return;
  const res = await recordAttemptOfflineAware({
    userId,
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
