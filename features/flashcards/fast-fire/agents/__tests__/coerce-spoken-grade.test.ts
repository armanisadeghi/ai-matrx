/**
 * `coerceSpokenGrade` — the spoken adapter over THE ONE verdict reader, read
 * directly. Fixture = the live `answer_grade` kind the shared grader emits
 * (core booleans + result token + spoken extras, `__kind` at every level).
 * Also pins `answerGradeValue`, the round-trip back to the kind value the
 * `AnswerGradeBlock` renders through the registered component.
 */

jest.mock("@/features/files/handler/handler", () => ({
  fileHandler: { upload: jest.fn(), toContentPart: jest.fn() },
}));
jest.mock(
  "@/features/agents/redux/execution-system/thunks/run-headless-agent-json",
  () => ({ runHeadlessAgentJson: jest.fn(), livePosture: () => ({}) }),
);

import { answerGradeValue, coerceSpokenGrade } from "../grading-core";

const LIVE_GRADE = {
  __kind: "answer_grade",
  correct: false,
  partial: true,
  result: "partial",
  misconception:
    "Confuses the location of the Calvin cycle (stroma) with the light reactions (thylakoid membranes).",
  explanation:
    "You named ATP as a product of the light reactions but left out NADPH, and you placed the Calvin cycle in the thylakoid rather than the stroma.",
  score: 0.55,
  rubric: { __kind: "grade_rubric", accuracy: 0.5, completeness: 0.5, clarity: 0.7 },
  transcript:
    "The light reactions make ATP, and then the Calvin cycle in the thylakoid uses it to make sugar.",
  audio_feedback:
    "Nice start — you have ATP. Add NADPH, and remember the Calvin cycle runs in the stroma.",
  missing: ["NADPH", "Calvin cycle location: stroma"],
};

describe("coerceSpokenGrade (answer_grade)", () => {
  it("reads the live kind payload: verdict from the core, spoken feedback as the explanation", () => {
    const grade = coerceSpokenGrade(LIVE_GRADE);
    expect(grade).not.toBeNull();
    expect(grade?.verdict).toEqual({
      correct: false,
      partial: true,
      misconception: LIVE_GRADE.misconception,
      explanation: LIVE_GRADE.audio_feedback,
    });
    expect(grade?.score).toBe(0.55);
    expect(grade?.rubric).toEqual({ accuracy: 0.5, completeness: 0.5, clarity: 0.7 });
    expect(grade?.transcript).toBe(LIVE_GRADE.transcript);
    expect(grade?.missing).toEqual(["NADPH", "Calvin cycle location: stroma"]);
    expect(grade?.pronunciation).toBeNull();
  });

  it("booleans win over a disagreeing token; a token alone still works; score is the last resort", () => {
    expect(
      coerceSpokenGrade({ ...LIVE_GRADE, correct: true, partial: false, result: "incorrect" })
        ?.verdict.correct,
    ).toBe(true);
    expect(coerceSpokenGrade({ result: "incorrect", feedback: "No.", score: 0.9 })?.verdict)
      .toMatchObject({ correct: false, partial: false, explanation: "No." });
    expect(coerceSpokenGrade({ score: 0.9 })?.verdict.correct).toBe(true);
    expect(coerceSpokenGrade({ score: 0.5 })?.verdict.partial).toBe(true);
  });

  it("clamps the score, tolerates a missing rubric, never throws", () => {
    const grade = coerceSpokenGrade({ result: "correct", score: 7, rubric: "n/a" });
    expect(grade?.score).toBe(1);
    expect(grade?.rubric).toEqual({ accuracy: 0, completeness: 0, clarity: 0 });
    expect(coerceSpokenGrade(null)).toBeNull();
    expect(coerceSpokenGrade([])).toBeNull();
  });

  it("answerGradeValue rebuilds the kind value (rubric nested as grade_rubric)", () => {
    const value = answerGradeValue(coerceSpokenGrade(LIVE_GRADE)!);
    expect(value).toMatchObject({
      __kind: "answer_grade",
      correct: false,
      partial: true,
      result: "partial",
      score: 0.55,
      rubric: { __kind: "grade_rubric", accuracy: 0.5, completeness: 0.5, clarity: 0.7 },
      transcript: LIVE_GRADE.transcript,
      audio_feedback: LIVE_GRADE.audio_feedback,
      missing: ["NADPH", "Calvin cycle location: stroma"],
    });
  });
});
