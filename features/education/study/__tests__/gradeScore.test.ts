// features/education/study/__tests__/gradeScore.test.ts
//
// The write→read round trip for a graded attempt's reasoning. This is the
// guard on the rule that a paid grade persists WHY, not just the score: if a
// key name drifts between buildGradeScore and readGradeScore, the explanation
// silently disappears from every review surface.

import { buildGradeScore, readGradeScore } from "../utils/gradeScore";

describe("gradeScore", () => {
  it("round-trips the grader's explanation and misconception", () => {
    const score = buildGradeScore({
      explanation: "You inverted the ratio.",
      misconception: "Believes part/whole and whole/part are interchangeable.",
    });
    expect(score).not.toBeNull();
    expect(readGradeScore(score)).toEqual({
      feedback: "You inverted the ratio.",
      misconception: "Believes part/whole and whole/part are interchangeable.",
      missing: undefined,
    });
  });

  it("persists the explanation under the canonical `feedback` key", () => {
    expect(buildGradeScore({ explanation: "Why." })).toEqual({
      feedback: "Why.",
    });
  });

  it("keeps missing[], rubric, steps and mode-specific extras", () => {
    const score = buildGradeScore({
      explanation: "Close.",
      missing: ["the units"],
      rubric: { clarity: 3 },
      steps: [{ index: 1, correct: false }],
      extra: { pronunciation: { clarity: 0.8 } },
    });
    expect(score).toMatchObject({
      feedback: "Close.",
      missing: ["the units"],
      rubric: { clarity: 3 },
      steps: [{ index: 1, correct: false }],
      pronunciation: { clarity: 0.8 },
    });
  });

  it("returns null when there is nothing worth persisting", () => {
    expect(buildGradeScore({})).toBeNull();
    expect(
      buildGradeScore({ explanation: "  ", misconception: null, missing: [] }),
    ).toBeNull();
  });

  it("reads defensively — a null/legacy score is empty, never a throw", () => {
    expect(readGradeScore(null)).toEqual({});
    expect(readGradeScore("nonsense")).toEqual({});
    expect(readGradeScore({ feedback: 42, missing: ["a", 7] })).toEqual({
      feedback: undefined,
      misconception: undefined,
      missing: ["a"],
    });
  });
});
