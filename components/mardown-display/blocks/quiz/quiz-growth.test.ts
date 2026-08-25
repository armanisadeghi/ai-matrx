/**
 * THE STREAMING GROWTH LAW, for the quiz.
 *
 * A streaming value only ever GROWS — so a quiz that gains questions mid-stream
 * must gain them WITHOUT resetting the reader's progress, moving the question
 * they are looking at, or reshuffling options they already answered against.
 * Before `appendNewQuestions`, every new question re-ran `initializeQuizState`,
 * which minted a new quiz id, re-shuffled everything and dropped all answers —
 * the "it renders, then loses state and comes back" defect.
 */

import {
  appendNewQuestions,
  initializeQuizState,
} from "./quiz-utils";
import type { OriginalQuestion, QuizAnswer, QuizState } from "./quiz-types";

/** Answer the question sitting at `index` — answers are keyed by INDEX. */
function answerAt(state: QuizState, index: number, selected = 0): QuizState {
  const answer: QuizAnswer = {
    questionId: state.randomizedQuestions[index].id,
    selectedOptionIndex: selected,
    isCorrect: false,
    timestamp: 1,
    timeSpent: 4,
  };
  return {
    ...state,
    progress: {
      ...state.progress,
      answers: { ...state.progress.answers, [index]: answer },
    },
  };
}

const q = (id: number, question: string, options: string[]): OriginalQuestion => ({
  id,
  question,
  options,
  correctAnswer: 0,
  explanation: "",
});

const Q1 = q(1, "Which organelle makes ATP?", ["Mito", "Nucleus", "Golgi"]);
const Q2 = q(2, "Do prokaryotes have a nucleus?", ["Yes", "No"]);
const Q3 = q(3, "What does DNA encode?", ["Proteins", "Lipids"]);

describe("appendNewQuestions — growth without disruption", () => {
  it("appends new questions while preserving quiz id, answers and position", () => {
    const answered = answerAt(initializeQuizState([Q1]), 0, 2);

    const grown = appendNewQuestions(answered, [Q1, Q2, Q3]);

    expect(grown.quizId).toBe(answered.quizId);
    expect(grown.progress).toBe(answered.progress);
    expect(grown.progress.answers[0].selectedOptionIndex).toBe(2);
    expect(grown.originalQuestions.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(grown.randomizedQuestions.map((x) => x.id)).toEqual([1, 2, 3]);
    // The already-dealt question keeps its exact shuffled option order.
    expect(grown.randomizedQuestions[0]).toBe(answered.randomizedQuestions[0]);
  });

  it("is a no-op when nothing new arrived (stable identity, no re-render churn)", () => {
    const state = initializeQuizState([Q1, Q2]);
    expect(appendNewQuestions(state, [Q1, Q2])).toBe(state);
  });

  it("refreshes an UNANSWERED question whose text/options grew mid-stream", () => {
    const partial = q(1, "Which organelle ma", []);
    const state = initializeQuizState([partial]);
    const grown = appendNewQuestions(state, [Q1]);

    expect(grown.originalQuestions[0].question).toBe(Q1.question);
    expect(grown.randomizedQuestions[0].options).toHaveLength(3);
  });

  it("never mutates a question the reader already answered", () => {
    // Regression guard: `answers` is keyed by question INDEX, not id. Reading
    // those keys as ids made an answered question look unanswered (and an
    // unanswered one look answered), so a question could be reshuffled out
    // from under a reader mid-stream.
    const partial = q(1, "Which organelle ma", ["Mito"]);
    const answered = answerAt(initializeQuizState([partial]), 0);

    const grown = appendNewQuestions(answered, [Q1]);
    expect(grown.originalQuestions[0].question).toBe(partial.question);
    expect(grown).toBe(answered);
  });

  it("keeps existing answer keys pointing at the same questions after growth", () => {
    // Appending must never renumber: index 0 still means the same question.
    const state = answerAt(initializeQuizState([Q1, Q2]), 1);
    const answeredId = state.randomizedQuestions[1].id;

    const grown = appendNewQuestions(state, [Q1, Q2, Q3]);

    expect(grown.randomizedQuestions[1].id).toBe(answeredId);
    expect(grown.progress.answers[1].questionId).toBe(answeredId);
  });

  it("leaves retake mode (a fixed question subset) alone", () => {
    const state = { ...initializeQuizState([Q1]), mode: "retake" as const };
    expect(appendNewQuestions(state, [Q1, Q2])).toBe(state);
  });
});
