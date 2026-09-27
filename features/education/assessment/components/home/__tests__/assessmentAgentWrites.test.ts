// The quiz / practice-test list's agent write targets refuse a bad list WHOLE,
// before the approval card, naming every problem — and accept a good one
// exactly, with markdown projected out of titles and topics.

import {
  parseCreateAssessmentsValue,
  parseDeleteAssessmentsValue,
  parseUpdateAssessmentsValue,
  type CurrentAssessment,
} from "../assessmentAgentWrites";
import { distinctTopic } from "../assessmentList";

const MINE: CurrentAssessment[] = [
  { id: "a1", title: "Cell Biology Checkpoint", archived: false },
  { id: "a2", title: "Organic Chemistry Review", archived: false },
  { id: "a3", title: "Old Spanish Verbs", archived: true },
];

describe("create_quizzes", () => {
  it("accepts a list, normalises fields and strips markdown from titles", () => {
    const out = parseCreateAssessmentsValue(
      "quizzes",
      [
        { title: "# Photosynthesis Basics", topic: "## Light reactions", depth: "Applied" },
        { title: "Cardiac cycle", description: "", exam_type: " AP Biology " },
      ],
      MINE,
    );
    expect(out).toEqual([
      { title: "Photosynthesis Basics", topic: "Light reactions", depth: "applied" },
      { title: "Cardiac cycle", description: null, exam_type: "AP Biology" },
    ]);
  });

  it("names every problem at once and refuses the whole list", () => {
    let message = "";
    try {
      parseCreateAssessmentsValue(
        "quizzes",
        [
          { title: "cell biology checkpoint" },
          { topic: "no title" },
          { title: "X", depth: "brutal", colour: "red" },
          { title: "X" },
        ],
        MINE,
      );
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("create_quizzes[1]");
    expect(message).toContain("title is required");
    expect(message).toContain("depth must be one of recall, applied, exam");
    expect(message).toContain("does not accept colour");
    expect(message).toContain("already has one titled");
  });
});

describe("update_practice_tests / delete_practice_tests", () => {
  it("plans a change and an archive; refuses ids that are not the person's", () => {
    const plans = parseUpdateAssessmentsValue(
      "practice_tests",
      [{ id: "a1", exam_type: null }, { id: "a2", archived: true }],
      MINE,
    );
    expect(plans.map((p) => p.changed)).toEqual([["exam_type"], ["archived"]]);
    expect(() =>
      parseUpdateAssessmentsValue("practice_tests", [{ id: "zzz", title: "Y" }], MINE),
    ).toThrow(/update_practice_tests\[0\].*not one of the person's own/);
    expect(() => parseUpdateAssessmentsValue("practice_tests", [{ id: "a3", title: "Y" }], MINE)).toThrow(
      /restore it first/,
    );
  });

  it("archives live ones only", () => {
    expect(parseDeleteAssessmentsValue("practice_tests", ["a1"], MINE)).toEqual([MINE[0]]);
    expect(() => parseDeleteAssessmentsValue("practice_tests", ["a3"], MINE)).toThrow(/already archived/);
  });
});

describe("distinctTopic", () => {
  it("hides a topic that only repeats the title", () => {
    expect(distinctTopic({ title: "Ava Science Book", topic: "ava science book" })).toBeNull();
    expect(distinctTopic({ title: "Photosynthesis", topic: "The Calvin Cycle" })).toBe("The Calvin Cycle");
  });
});
