// features/flashcards/fast-fire/agents/gradeTypedCard.thunk.ts
//
// TYPED MODE grading (page-pass 2026-09-27). A FastFire drill answered by
// typing — no microphone at all — is graded on MEANING by the same mandate
// Write mode uses (`flashcards.grade_typed_answer`, via `gradeTypedSemantic`),
// FIRE-AND-FORGET exactly like the spoken grader: the drill never awaits it,
// and the grade reaches the UI only through `gradeResolved`.
//
// An empty answer is not sent to a grader (it would invent a verdict from the
// card back): it lands as incorrect with the plain reason "No answer typed".

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { gradeResultScore } from "@/features/education/trust/types";
import { FC_MANDATES } from "@/features/flashcards/data/mandates";
import { gradeTypedSemantic } from "@/features/flashcards/data/gradeTypedSemantic";
import { ensureFastFireSession } from "../redux/fastFireSession";
import {
  gradeFailed,
  gradePending,
  gradeResolved,
} from "../redux/fastFireSlice";
import { recordAttempt } from "./gradeCard.thunk";

export interface GradeTypedCardArgs {
  cardId: string;
  front: string;
  back: string;
  /** What the learner typed ("" when nothing). */
  answer: string;
  runId: string | null;
}

export function gradeTypedCard(args: GradeTypedCardArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<void> => {
    const { cardId, front, back, runId } = args;
    const answer = args.answer.trim();
    const sessionId = await dispatch(ensureFastFireSession(runId));
    const userId = selectUserId(getState()) ?? "";
    const base = {
      userId,
      cardId,
      sessionId,
      runId,
      responseAudioFileId: null,
      responseKind: "typed" as const,
    };

    if (!answer) {
      const feedback = "No answer typed.";
      dispatch(
        gradeResolved({
          cardId,
          runId,
          score: 0,
          result: "incorrect",
          rubric: null,
          transcript: "",
          feedback,
          missing: [],
        }),
      );
      await recordAttempt({
        ...base,
        result: "incorrect",
        scoreValue: 0,
        score: { feedback },
        transcript: null,
        gradedBy: null,
      });
      return;
    }

    dispatch(gradePending({ cardId, responseAudioFileId: null, runId }));
    const outcome = await dispatch(
      gradeTypedSemantic({
        question: front,
        expectedAnswer: back,
        learnerAnswer: answer,
      }),
    );
    if (!outcome || outcome.kind === "unusable") {
      const message =
        outcome?.kind === "unusable"
          ? outcome.sentence
          : "The grader did not answer — your answer is saved ungraded.";
      dispatch(gradeFailed({ cardId, error: message, runId }));
      await recordAttempt({
        ...base,
        result: null,
        scoreValue: null,
        score: { grade_error: message },
        transcript: answer,
        gradedBy: FC_MANDATES.gradeTypedAnswer,
      });
      return;
    }
    const { result, reason } = outcome.verdict;
    const score = gradeResultScore(result);
    dispatch(
      gradeResolved({
        cardId,
        runId,
        score,
        result,
        rubric: null,
        transcript: answer,
        feedback: reason ?? "",
        missing: [],
      }),
    );
    await recordAttempt({
      ...base,
      result,
      scoreValue: score,
      score: { feedback: reason ?? "" },
      transcript: answer,
      gradedBy: FC_MANDATES.gradeTypedAnswer,
    });
  };
}
