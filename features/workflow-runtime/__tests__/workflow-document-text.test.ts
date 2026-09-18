import { workflowDocumentText } from "../workflow-document-text";

describe("workflow document action content", () => {
  it("uses the agent's answer, never its prompt or billing envelope", () => {
    const output = {
      __kind: "agent_result",
      final_text: "## Refined instructions\n\nUse the new table.",
      messages: [{ role: "system", content: "Private system prompt" }],
      usage: { cost_usd: 0.18 },
      request_id: "private-request-id",
    };
    expect(workflowDocumentText(output)).toBe(output.final_text);
  });

  it("uses the exact single document in a delivered output", () => {
    const instructions =
      "# Final instructions\n\nCopy this to the implementers.";
    expect(workflowDocumentText({ instructions })).toBe(instructions);
    expect(
      workflowDocumentText({
        __kind: "node_outcome",
        output: { instructions },
        node_id: "final",
      }),
    ).toBe(instructions);
  });

  it("keeps an ordered markdown content channel when final text is absent", () => {
    expect(
      workflowDocumentText({
        final_text: "",
        content: [
          { __kind: "markdown", text: "First section" },
          { __kind: "markdown", text: "Second section" },
        ],
      }),
    ).toBe("First section\n\nSecond section");
  });

  it("refuses a multi-field structured result rather than saving part of it", () => {
    expect(
      workflowDocumentText({ title: "Plan", instructions: "Partial" }),
    ).toBeNull();
    expect(
      workflowDocumentText({ title: "Report", output: "Partial body" }),
    ).toBeNull();
    expect(
      workflowDocumentText({ messages: ["secret"], usage: {} }),
    ).toBeNull();
    expect(
      workflowDocumentText({
        final_text: "Old prose",
        structured_output: { cards: [{ question: "One?" }] },
      }),
    ).toBeNull();
    expect(
      workflowDocumentText({
        final_text: "Old prose",
        content: [
          { __kind: "markdown", text: "Introduction" },
          { __kind: "flashcard_set", cards: [] },
        ],
      }),
    ).toBeNull();
  });
});
