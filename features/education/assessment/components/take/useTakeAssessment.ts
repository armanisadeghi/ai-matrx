"use client";

// features/education/assessment/components/take/useTakeAssessment.ts
//
// Orchestrates ONE taking of an assessment: opens a study-spine session + an
// assessment_result row, grades each answer (local objective grade OR the
// grade-on-meaning agent), records EVERY answer to the shared study spine
// (item_type='assessment_item', method=kind) so quiz misses feed FSRS mastery +
// weak-area review, then finalizes the result with the scored breakdown.
//
// The result row carries the learning-gain `phase`/`gain_group_id` so a
// baseline→post pair produces a persisted delta (learningGain.ts).
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { useRef, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { studyService } from "@/features/education/study/service/studyService";
import { buildGradeScore } from "@/features/education/study/utils/gradeScore";
import { assessmentService } from "../../data/assessmentService";
import { ASSESSMENT_ITEM_TYPE } from "../../data/mandates";
import {
  gradeAnswerLocal,
  gradeAnswerAI,
  gradeAnswerImage,
  isObjectiveType,
  type GradedAnswer,
} from "../../data/grading";
import type {
  AssessmentItemRow,
  AssessmentRow,
  AttemptResult,
  ResultItemDetail,
  ResultPhase,
  QuestionType,
} from "../../data/types";

export interface TakeOptions {
  phase?: ResultPhase;
  gainGroupId?: string | null;
  /**
   * False until an organization is chosen — see StudyOrganizationGate. `start`
   * writes nothing (no `study_session`, no result row) while it is false.
   * Defaults true.
   */
  enabled?: boolean;
}

export interface AnswerRecord {
  item: AssessmentItemRow;
  response: string;
  graded: GradedAnswer;
}

const responseKindFor = (
  t: QuestionType,
): "selected" | "typed" | "written" =>
  t === "multiple_choice" || t === "true_false"
    ? "selected"
    : t === "written_response"
      ? "written"
      : "typed";

/** Free-response types that can be answered by photographing handwritten work. */
export function canPhotographAnswer(t: QuestionType): boolean {
  return t === "written_response" || t === "short_answer";
}

export function useTakeAssessment(
  assessment: AssessmentRow,
  items: AssessmentItemRow[],
  opts: TakeOptions = {},
) {
  const dispatch = useAppDispatch();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [grading, setGrading] = useState(false);
  const [records, setRecords] = useState<AnswerRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pointsPossible = items.reduce((s, it) => s + Number(it.points ?? 1), 0);

  /**
   * Begin the taking — writes NOTHING. The clock starts; the study session and
   * the result row open on the first recorded answer (or on finish), so
   * opening a quiz and leaving leaves no empty session in history.
   */
  async function start(): Promise<void> {
    if (startedAt !== null || opts.enabled === false) return;
    setError(null);
    setStartedAt(Date.now());
  }

  /** The session + result ids, opened once on the first answer. */
  const recordRef = useRef<Promise<{ sessionId: string; resultId: string } | null> | null>(null);
  function openRecord(): Promise<{ sessionId: string; resultId: string } | null> {
    if (opts.enabled === false) return Promise.resolve(null);
    if (!recordRef.current) {
      recordRef.current = openRecordOnce().then((ids) => {
        // A failed open may be retried by the next answer.
        if (!ids) recordRef.current = null;
        return ids;
      });
    }
    return recordRef.current;
  }

  async function openRecordOnce(): Promise<{ sessionId: string; resultId: string } | null> {
    setStarting(true);
    setError(null);
    try {
      const sess = await studyService.createSession({
        mode: assessment.assessment_kind,
        sourceKind: null,
        sourceQuery: { assessmentId: assessment.id },
        settings: { assessmentKind: assessment.assessment_kind },
      });
      if (sess.error || !sess.data) {
        setError(sess.error ?? "Could not open a study session");
        return null;
      }
      const res = await assessmentService.createResult({
        assessmentId: assessment.id,
        sessionId: sess.data.id,
        phase: opts.phase ?? "standalone",
        gainGroupId: opts.gainGroupId ?? null,
        topic: assessment.topic,
        sourceKind: assessment.source_kind,
        sourceId: assessment.source_id,
        totalCount: items.length,
        pointsPossible,
      });
      if (res.error || !res.data) {
        setError(res.error ?? "Could not start the assessment");
        return null;
      }
      setSessionId(sess.data.id);
      setResultId(res.data.id);
      return { sessionId: sess.data.id, resultId: res.data.id };
    } finally {
      setStarting(false);
    }
  }

  /**
   * Grade + record ONE answer. Returns the graded verdict (for immediate
   * feedback). Objective types grade locally; free-response types grade on
   * meaning via the agent. Every answer writes the study spine.
   */
  async function submit(
    item: AssessmentItemRow,
    response: string,
    photo?: File | null,
  ): Promise<GradedAnswer> {
    setGrading(true);
    try {
      // The first answer opens the session + result row (once).
      const ids = await openRecord();
      const type = item.question_type as QuestionType;
      const expected =
        type === "written_response"
          ? item.rubric ?? item.explanation ?? ""
          : item.correct_answer ?? "";
      let graded: GradedAnswer;
      if (photo && canPhotographAnswer(type)) {
        // The IMAGE branch of the grade-on-meaning path — a photographed
        // handwritten answer, routed to the vision grader (step-level verdict).
        graded = await dispatch(
          gradeAnswerImage({
            question: item.prompt,
            expected,
            photo,
            itemId: item.id,
            surfaceKey: "assessment-grade-image",
            surfaceName: "matrx-user/education-assessment",
          }),
        );
      } else if (isObjectiveType(type)) {
        graded =
          gradeAnswerLocal(item, response) ?? {
            result: "incorrect",
            scoreValue: 0,
            explanation: item.explanation ?? "",
            misconception: null,
            gradedBy: "local",
          };
      } else {
        graded = await dispatch(
          gradeAnswerAI({
            question: item.prompt,
            expected,
            learnerAnswer: response,
          }),
        );
      }

      const gradedByImage = graded.responseImageFileId != null;
      const gradeScore = buildGradeScore({
        explanation: graded.explanation,
        misconception: graded.misconception,
        steps: graded.steps,
      });
      // Record to the shared study spine (feeds FSRS mastery + weak-area review).
      // A photographed answer records as 'handwritten' with the durable photo
      // file_id + the grader's transcription + the per-step breakdown.
      await studyService.recordAttempt({
        itemType: ASSESSMENT_ITEM_TYPE,
        itemId: item.id,
        method: assessment.assessment_kind,
        result: graded.result,
        scoreValue: graded.scoreValue,
        responseKind: gradedByImage ? "handwritten" : responseKindFor(type),
        responseTranscript: gradedByImage
          ? graded.transcription ?? null
          : response || null,
        gradedBy: graded.gradedBy,
        ...(gradedByImage
          ? { responseImageFileId: graded.responseImageFileId }
          : {}),
        // A paid grade persists its REASONING, not just its score: the
        // explanation + named misconception ride in the attempt's score jsonb
        // (the canonical home — see study/utils/gradeScore.ts) so review, the
        // study plan, and weak-area drilling can read them back without
        // re-grading. Losing them was a real defect.
        ...(gradeScore ? { score: gradeScore } : {}),
        ...(ids ? { sessionId: ids.sessionId } : {}),
      });

      setRecords((prev) => [
        ...prev.filter((r) => r.item.id !== item.id),
        { item, response, graded },
      ]);
      return graded;
    } finally {
      setGrading(false);
    }
  }

  /** The learner overrides an AI grade (grade-on-meaning can be argued). */
  function override(itemId: string, result: AttemptResult): void {
    setRecords((prev) =>
      prev.map((r) =>
        r.item.id === itemId
          ? {
              ...r,
              graded: {
                ...r.graded,
                result,
                scoreValue:
                  result === "correct" ? 1 : result === "partial" ? 0.5 : 0,
                gradedBy: "user",
              },
            }
          : r,
      ),
    );
  }

  /** Finalize: aggregate the records, write the scored result + close the session. */
  async function finish(): Promise<string | null> {
    // Finishing is an action: a taking finished with no answer still records
    // its (empty) result. Opening alone never does.
    const ids = await openRecord();
    if (!ids) return null;
    const { resultId, sessionId } = ids;
    const correctCount = records.filter((r) => r.graded.result === "correct").length;
    const partialCount = records.filter((r) => r.graded.result === "partial").length;
    const pointsEarned = records.reduce(
      (s, r) => s + r.graded.scoreValue * Number(r.item.points ?? 1),
      0,
    );
    const scoreValue = pointsPossible > 0 ? pointsEarned / pointsPossible : 0;
    const durationSeconds = startedAt
      ? Math.round((Date.now() - startedAt) / 1000)
      : null;
    const detail: ResultItemDetail[] = records.map((r) => ({
      itemId: r.item.id,
      questionType: r.item.question_type as QuestionType,
      response: r.response || null,
      result: r.graded.result,
      scoreValue: r.graded.scoreValue,
      points: Number(r.item.points ?? 1),
      correctAnswer: r.item.correct_answer,
      explanation: r.graded.explanation,
      misconception: r.graded.misconception,
    }));

    const [fin] = await Promise.all([
      assessmentService.finalizeResult({
        resultId,
        correctCount,
        partialCount,
        totalCount: items.length,
        scoreValue,
        pointsEarned,
        pointsPossible,
        durationSeconds,
        detail,
      }),
      sessionId
        ? studyService.updateSession(sessionId, {
            status: "completed",
            ended_at: new Date().toISOString(),
            aggregate_score: {
              score_pct: Math.round(scoreValue * 100),
              correct: correctCount,
              partial: partialCount,
              total: items.length,
            } as never,
          })
        : Promise.resolve(null),
    ]);
    if (fin.error) {
      setError(fin.error);
      return null;
    }
    return resultId;
  }

  return {
    start,
    submit,
    override,
    finish,
    sessionId,
    resultId,
    /** True once the taking began (the clock runs) — nothing is written yet. */
    started: startedAt !== null,
    starting,
    grading,
    records,
    error,
    pointsPossible,
  };
}
