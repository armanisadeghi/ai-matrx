/**
 * A `quiz_set` kind value (title + questions[], correct_answer as text or
 * letter) prints ALL its questions through the one quiz printer — the canvas
 * tab used to print only the question on screen ("No quiz data" before that).
 */
const opened: string[] = [];
jest.mock("@ai-matrx/print/core", () => ({
  ...jest.requireActual("@ai-matrx/print/core"),
  openPrintWindow: (doc: string) => void opened.push(doc),
}));
import { quizPrinter } from "./quiz-printer";
import { normalizeRawQuizJSON } from "./quiz-parser";

const QUIZ_SET = {
  __kind: "quiz_set",
  title: "Boxes",
  questions: [
    { __kind: "quiz_question", type: "multiple_choice", question: "Q-one?", options: ["red", "blue", "green"], correct_answer: "blue", explanation: "Because." },
    { __kind: "quiz_question", type: "multiple_choice", question: "Q-two?", options: ["x", "y"], correct_answer: "A" },
    { __kind: "quiz_question", type: "short_answer", question: "Q-three?", correct_answer: "forty-two" },
  ],
};

describe("quiz_set printing", () => {
  it("normalizes every question, resolving the answer by text, letter, or keeping it as text", () => {
    const quiz = normalizeRawQuizJSON(QUIZ_SET)!;
    expect(quiz.multipleChoice.map((q) => q.correctAnswer)).toEqual([1, 0, -1]);
    expect(quiz.multipleChoice[2].answerText).toBe("forty-two");
  });

  it("the message-print form carries all questions", () => {
    const out = quizPrinter.toPrintHtml!(QUIZ_SET, { type: "quiz_set", raw: "" }) as { html: string };
    for (const q of ["Q-one?", "Q-two?", "Q-three?"]) expect(out.html).toContain(q);
    expect(out.html).toContain("answer-lines");
  });

  it("with-answers and answer-key variants print all questions with the key", () => {
    opened.length = 0;
    quizPrinter.print(QUIZ_SET, "answer-key");
    quizPrinter.print(QUIZ_SET, "with-answers");
    expect(opened[0]).toContain("B. blue");
    expect(opened[0]).toContain("forty-two");
    expect(opened[0]).toContain("A. x");
    expect(opened[1]).toContain("Q-three?");
    expect(opened[1]).toContain("Answer:");
  });
});
