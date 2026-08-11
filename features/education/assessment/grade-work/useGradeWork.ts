"use client";

// features/education/assessment/grade-work/useGradeWork.ts
//
// Orchestrates the STANDALONE "Grade my handwritten work" flow: a learner types
// the problem (+ optional model answer / rubric), photographs their worked
// solution, and gets a step-level grade. It reuses the SAME image grading path
// as the assessment take flow (`gradeAnswerImage` → vision grader → step
// verdict) and records to the SAME study spine — item_type 'handwritten_work',
// response_kind 'handwritten' — so standalone grades feed FSRS mastery + streak
// exactly like every other study action. No new grader, no new spine.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { studyService } from "@/features/education/study/service/studyService";
import { buildGradeScore } from "@/features/education/study/utils/gradeScore";
import { gradeAnswerImage, type GradedAnswer } from "../data/grading";
import { HANDWRITTEN_WORK_ITEM_TYPE } from "../data/agents";

export type GradeWorkStatus = "idle" | "grading" | "graded" | "error";

export interface GradeWorkInput {
  /** The problem / question the learner solved (required). */
  problem: string;
  /** Optional model answer or rubric. Empty ⇒ the grader solves it itself. */
  expected: string;
  photo: File;
}

const NO_MODEL_ANSWER =
  "No model answer was provided. Solve the problem yourself to determine the correct result and full-credit reasoning, then grade the student's photographed work against that.";

export function useGradeWork() {
  const dispatch = useAppDispatch();
  const [status, setStatus] = useState<GradeWorkStatus>("idle");
  const [result, setResult] = useState<GradedAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function grade(input: GradeWorkInput): Promise<GradedAnswer | null> {
    setStatus("grading");
    setError(null);
    setResult(null);
    try {
      // Open a study session so the grade counts toward the streak + history.
      const session = await studyService.createSession({
        mode: "grade_work",
        sourceKind: null,
        settings: {},
      });
      const sessionId = session.data?.id ?? null;

      const graded = await dispatch(
        gradeAnswerImage({
          question: input.problem,
          expected: input.expected.trim() || NO_MODEL_ANSWER,
          photo: input.photo,
          surfaceKey: "grade-work",
          surfaceName: "matrx-user/education-grade-work",
        }),
      );

      // Record to the shared study spine. Each standalone problem is its own
      // item (a fresh id) — an attempt + a session, no assessment row needed.
      const itemId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const gradeScore = buildGradeScore({
        explanation: graded.explanation,
        misconception: graded.misconception,
        steps: graded.steps,
      });
      const rec = await studyService.recordAttempt({
        itemType: HANDWRITTEN_WORK_ITEM_TYPE,
        itemId,
        method: "grade_work",
        result: graded.result,
        scoreValue: graded.scoreValue,
        responseKind: "handwritten",
        responseTranscript: graded.transcription ?? null,
        gradedBy: graded.gradedBy,
        ...(graded.responseImageFileId
          ? { responseImageFileId: graded.responseImageFileId }
          : {}),
        // Same rule as the take flow: the vision grade's REASONING (why, and
        // the named misconception) is the half worth keeping — persist it on
        // the attempt row, never leave it in component state.
        ...(gradeScore ? { score: gradeScore } : {}),
        ...(sessionId ? { sessionId } : {}),
      });
      if (rec.error) {
        console.error("[useGradeWork] recordAttempt failed:", rec.error);
      }
      if (sessionId) {
        await studyService.updateSession(sessionId, {
          status: "completed",
          ended_at: new Date().toISOString(),
        });
      }

      setResult(graded);
      setStatus("graded");
      return graded;
    } catch (err) {
      console.error("[useGradeWork] grade failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong grading that photo.",
      );
      setStatus("error");
      return null;
    }
  }

  function reset(): void {
    setStatus("idle");
    setResult(null);
    setError(null);
  }

  return { status, result, error, grade, reset };
}
