// features/education/spoken-practice/data/gradePracticeAnswer.ts
//
// Grade ONE spoken practice answer with the DEDICATED, mode-aware spoken-practice
// grader (SPOKEN_PRACTICE_AGENTS.gradeAnswer) — replacing the FastFire flashcard
// grader, which sometimes said "we can try this flashcard again" in oral-exam mode
// (adversarial-review GAP 1). The mode/persona is conveyed to the (single) grader
// via the first line of `rubric`, so per-answer feedback fits examiner / interviewer
// / debate and never mentions flashcards.
//
// REUSES the crown-jewel grading-core primitives unchanged (uploadResponseClip +
// runSpokenGrader + coerceSpokenGrade) and the study spine (recordAttempt). Output
// is the unified `SpokenGrade` / `GradeVerdict` shape — never a forked verdict type.
// FastFire's own `gradeSpokenAnswer` thunk is left untouched (this feature just
// stops calling it).

import type { AppDispatch } from "@/lib/redux/store";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import { verdictResult } from "@/features/education/trust/types";
import { studyService } from "@/features/education/study/service/studyService";
import {
  runSpokenGrader,
  uploadResponseClip,
  type SpokenGrade,
} from "@/features/flashcards/fast-fire/agents/grading-core";
import { SPOKEN_PRACTICE_AGENTS, SPOKEN_PROMPT_ITEM_TYPE } from "../agents";
import { MODE_CONFIG } from "../constants";
import type { SpokenPracticeMode } from "../types";

export interface GradePracticeAnswerArgs {
  mode: SpokenPracticeMode;
  /** The prompt posed to the student. */
  prompt: string;
  /** The reference / model answer (what a strong answer covers). */
  referenceAnswer: string;
  /** The per-prompt rubric from the designer (mode framing is prepended here). */
  rubric: string;
  secondsAllowed: number;
  clip: Blob | null;
  /** study-spine item id (the client-minted prompt id) — records the attempt. */
  itemId: string;
  sessionId: string | null;
}

export interface GradePracticeAnswerResult {
  status: "graded" | "skipped" | "error";
  grade?: SpokenGrade;
  responseAudioFileId: string | null;
  error?: string;
}

/**
 * Prepend the mode + persona so the mode-parameterized grader frames its feedback
 * correctly (examiner / interviewer / debate-judge) and never says "flashcard".
 */
function modeRubric(mode: SpokenPracticeMode, rubric: string): string {
  const cfg = MODE_CONFIG[mode];
  const header =
    mode === "pronunciation"
      ? `Practice mode: ${cfg.label} — you are the ${cfg.persona.toLowerCase()}. Grade this spoken answer on BOTH content (did they say the right target-language phrase) AND pronunciation/fluency; refer to "this phrase"/"this answer", never to flashcards or cards.`
      : `Practice mode: ${cfg.label} — you are the ${cfg.persona.toLowerCase()}. Grade this spoken answer in that frame; refer to "this answer"/"this question", never to flashcards or cards.`;
  const body = rubric.trim();
  return body ? `${header}\n\n${body}` : header;
}

/**
 * The grader for a mode. `pronunciation` uses the DEDICATED language-coach grader
 * (emits the extra `pronunciation` dimensions); every other mode uses the shared
 * spoken-practice grader. Both return the unified `SpokenGrade` shape.
 */
function graderAgentId(mode: SpokenPracticeMode): string {
  return mode === "pronunciation"
    ? SPOKEN_PRACTICE_AGENTS.gradePronunciation
    : SPOKEN_PRACTICE_AGENTS.gradeAnswer;
}

export function gradePracticeAnswer(args: GradePracticeAnswerArgs) {
  return async (dispatch: AppDispatch): Promise<GradePracticeAnswerResult> => {
    const gradedByAgent = graderAgentId(args.mode);
    try {
      // Best-effort durable upload — a failed upload must never throw (we skip
      // grading and record a result-less attempt, keeping the ledger honest).
      const responseAudioFileId = await uploadResponseClip(args.clip, {
        folderPath: CloudFolders.SYSTEM_SPOKEN_PRACTICE_RESPONSES,
        metadata: {
          origin: "spoken-practice",
          mode: args.mode,
          item_type: SPOKEN_PROMPT_ITEM_TYPE,
          item_id: args.itemId,
          session_id: args.sessionId ?? null,
        },
        cardId: args.itemId,
      });

      if (!responseAudioFileId) {
        await recordAttempt(args, null, null, null);
        return {
          status: "skipped",
          responseAudioFileId: null,
          error:
            args.clip && args.clip.size > 0
              ? "Could not upload your recording — check your connection and try again."
              : undefined,
        };
      }

      const grade = await dispatch(
        runSpokenGrader({
          agentId: gradedByAgent,
          front: args.prompt,
          back: args.referenceAnswer,
          secondsAllowed: args.secondsAllowed,
          responseAudioFileId,
          rubric: modeRubric(args.mode, args.rubric),
          surfaceKey: "spoken-practice-grade",
          sourceFeature: "education-assessment",
        }),
      );

      if (!grade) {
        await recordAttempt(args, responseAudioFileId, null, gradedByAgent);
        return {
          status: "error",
          responseAudioFileId,
          error: "The examiner didn't return a grade for that answer.",
        };
      }

      await recordAttempt(args, responseAudioFileId, grade, gradedByAgent);
      return { status: "graded", grade, responseAudioFileId };
    } catch (err) {
      console.error("[spoken-practice.gradePracticeAnswer] failed:", err);
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

/** Record the attempt on the shared study spine (advances mastery). Loud on error. */
async function recordAttempt(
  args: GradePracticeAnswerArgs,
  responseAudioFileId: string | null,
  grade: SpokenGrade | null,
  gradedBy: string | null,
): Promise<void> {
  const res = await studyService.recordAttempt({
    itemType: SPOKEN_PROMPT_ITEM_TYPE,
    itemId: args.itemId,
    method: args.mode,
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
            // Pronunciation dims ride in the attempt's score jsonb (present only
            // for the pronunciation mode) so the spine row carries the delivery
            // assessment alongside the content grade.
            ...(grade.pronunciation
              ? { pronunciation: grade.pronunciation }
              : {}),
          },
        }
      : {}),
    ...(responseAudioFileId ? { responseAudioFileId } : {}),
    ...(grade?.transcript ? { responseTranscript: grade.transcript } : {}),
    ...(gradedBy ? { gradedBy } : {}),
  });
  if (res.error) {
    console.error(
      "[spoken-practice.gradePracticeAnswer] recordAttempt failed:",
      res.error,
    );
  }
}
