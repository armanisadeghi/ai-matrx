import {
  isEditableKeywordWorkflowStatus,
  isKeywordWorkflowStatus,
  KEYWORD_WORKFLOW_EDIT_OPTIONS,
  KEYWORD_WORKFLOW_FILTER_OPTIONS,
  keywordWorkflowStage,
} from "./workflow-status";

describe("keyword SEO stage vocabulary", () => {
  it("translates storage values into plain-language product labels", () => {
    expect(keywordWorkflowStage(null).label).toBe("Not tracked");
    expect(keywordWorkflowStage("candidate").label).toBe("Opportunity");
    expect(keywordWorkflowStage("ignored").label).toBe("Not pursuing");
    expect(keywordWorkflowStage("suppressed").label).toBe(
      "Excluded by strategy",
    );
  });

  it("keeps every persisted stage filterable", () => {
    expect(KEYWORD_WORKFLOW_FILTER_OPTIONS.map(({ value }) => value)).toEqual([
      "candidate",
      "targeted",
      "in_progress",
      "ranking",
      "ignored",
      "suppressed",
    ]);
  });

  it("does not offer suppression without its required strategy reason", () => {
    expect(KEYWORD_WORKFLOW_EDIT_OPTIONS.map(({ value }) => value)).toEqual([
      "candidate",
      "targeted",
      "in_progress",
      "ranking",
      "ignored",
    ]);
    expect(isKeywordWorkflowStatus("suppressed")).toBe(true);
    expect(isEditableKeywordWorkflowStatus("suppressed")).toBe(false);
  });
});
