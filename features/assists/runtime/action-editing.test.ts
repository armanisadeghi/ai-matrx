import { getAssistActionTextEditor } from "./action-editing";
import type { AssistAction } from "../types";

describe("getAssistActionTextEditor", () => {
  const guidelineAction: AssistAction = {
    kind: "apply_keyword_meaning",
    siteId: "site-1",
    siteLabel: "Example",
    proposal: {
      proposal: "guideline_edit",
      baseVersion: 4,
      proposedText: "Original guidelines",
      summary: "Clarify CRT traffic",
    },
    provenance: { agentName: "Keyword analyst" },
    payloadHash: "original-proposal-hash",
  };

  it("offers the full guideline document for editing", () => {
    const editor = getAssistActionTextEditor(guidelineAction);

    expect(editor?.value).toBe("Original guidelines");
    expect(editor?.label).toBe("Exact text that will be saved");
    expect(editor?.description).toContain("headline summarizes");
    expect(editor?.description).toContain("exactly this text");
    expect(editor?.validate("  ")).toBe("Guidelines cannot be empty.");
  });

  it("rebuilds the typed action while preserving proposal identity", () => {
    const editor = getAssistActionTextEditor(guidelineAction);
    const editedAction = editor?.apply("My revised guidelines");

    expect(editedAction).toEqual({
      ...guidelineAction,
      proposal: {
        ...guidelineAction.proposal,
        proposedText: "My revised guidelines",
      },
    });
    expect(
      editedAction?.kind === "apply_keyword_meaning"
        ? editedAction.payloadHash
        : null,
    ).toBe("original-proposal-hash");
  });

  it("does not claim unrelated actions are editable", () => {
    expect(
      getAssistActionTextEditor({ kind: "navigate", href: "/assists" }),
    ).toBeNull();
  });
});
