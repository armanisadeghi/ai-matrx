import {
  hasSameAssessmentItemRevisions,
  parseAddAssessmentItems,
  parseDeleteAssessmentItems,
  parseUpdateAssessment,
  parseUpdateAssessmentItems,
} from "./assessmentEditorAgentWrites";

const ASSESSMENT = { id: "assessment-1", version: 7, title: "Cell Biology" };
const ITEMS = [{ id: "item-1", version: 4, prompt: "What is a cell?" }];

describe("assessment editor agent writes", () => {
  it("accepts a versioned title update and refuses a stale one", () => {
    expect(
      parseUpdateAssessment(
        { expected_version: 7, title: "Cell structure" },
        ASSESSMENT,
      ),
    ).toEqual({ expectedVersion: 7, patch: { title: "Cell structure" } });
    expect(() =>
      parseUpdateAssessment(
        { expected_version: 6, title: "Cell structure" },
        ASSESSMENT,
      ),
    ).toThrow(/loaded version 7/);
  });

  it("requires the loaded assessment version before adding questions", () => {
    expect(
      parseAddAssessmentItems(
        [
          {
            expected_assessment_version: 7,
            question_type: "multiple_choice",
            prompt: "Which organelle makes ATP?",
            options: ["Mitochondrion", "Nucleus"],
            correct_answer: "Mitochondrion",
          },
        ],
        7,
      ),
    ).toHaveLength(1);
    expect(() =>
      parseAddAssessmentItems(
        [
          {
            expected_assessment_version: 6,
            question_type: "short_answer",
            prompt: "Name a cell type",
          },
        ],
        7,
      ),
    ).toThrow(/loaded assessment version 7/);
  });

  it("requires each loaded question revision for update and delete", () => {
    expect(
      parseUpdateAssessmentItems(
        [
          {
            id: "item-1",
            expected_version: 4,
            prompt: "What is the basic unit of life?",
          },
        ],
        ITEMS,
      ),
    ).toEqual([
      {
        id: "item-1",
        expectedVersion: 4,
        patch: { prompt: "What is the basic unit of life?" },
      },
    ]);
    expect(() =>
      parseDeleteAssessmentItems(
        [{ id: "item-1", expected_version: 3 }],
        ITEMS,
      ),
    ).toThrow(/loaded version 4/);
  });

  it("detects added, removed, and revised questions before an append", () => {
    const snapshot = [
      { id: "item-1", version: 4 },
      { id: "item-2", version: 2 },
    ];
    expect(hasSameAssessmentItemRevisions(snapshot, [...snapshot])).toBe(true);
    expect(
      hasSameAssessmentItemRevisions(snapshot, [
        { id: "item-1", version: 5 },
        { id: "item-2", version: 2 },
      ]),
    ).toBe(false);
    expect(
      hasSameAssessmentItemRevisions(snapshot, [{ id: "item-1", version: 4 }]),
    ).toBe(false);
    expect(
      hasSameAssessmentItemRevisions(snapshot, [
        { id: "item-1", version: 4 },
        { id: "item-3", version: 2 },
      ]),
    ).toBe(false);
  });
});
