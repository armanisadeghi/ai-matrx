/**
 * `readTypedGradeVerdict` is a thin adapter over THE ONE verdict reader
 * (`coerceGradeVerdict`). Fixture = the live `answer_grade` kind (the shared
 * grader emits the core booleans AND a `result` token; `__kind` ignored).
 */

jest.mock(
  "@/features/agents/redux/execution-system/thunks/run-headless-agent-json",
  () => ({ runHeadlessAgentJson: jest.fn(), livePosture: () => ({}) }),
);

import { readTypedGradeVerdict } from "../gradeTypedSemantic";

const LIVE_GRADE = {
  __kind: "answer_grade",
  correct: false,
  partial: true,
  result: "partial",
  misconception: "Confuses the location of the Calvin cycle (stroma) with the light reactions.",
  explanation: "You named ATP but left out NADPH, and placed the Calvin cycle in the thylakoid.",
  score: 0.55,
  rubric: { __kind: "grade_rubric", accuracy: 0.5, completeness: 0.5, clarity: 0.7 },
  transcript: "The light reactions make ATP...",
  audio_feedback: "Nice start.",
  missing: ["NADPH"],
};

describe("readTypedGradeVerdict (answer_grade core)", () => {
  it("reads the live kind payload: result from the booleans, reason = explanation + misconception", () => {
    expect(readTypedGradeVerdict(LIVE_GRADE)).toEqual({
      result: "partial",
      reason:
        "You named ATP but left out NADPH, and placed the Calvin cycle in the thylakoid. (misconception: Confuses the location of the Calvin cycle (stroma) with the light reactions.)",
    });
  });

  it("still accepts the result-token-only contract (rebind tolerance)", () => {
    expect(readTypedGradeVerdict({ result: "Correct", reason: "Same meaning." })).toEqual({
      result: "correct",
      reason: "Same meaning.",
    });
    expect(readTypedGradeVerdict({ grade: "incorrect" })).toEqual({
      result: "incorrect",
      reason: null,
    });
  });

  it("null when there is no verdict signal", () => {
    expect(readTypedGradeVerdict({ tip: "x" })).toBeNull();
    expect(readTypedGradeVerdict(null)).toBeNull();
  });
});
