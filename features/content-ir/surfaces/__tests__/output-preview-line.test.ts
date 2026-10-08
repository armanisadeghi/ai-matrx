// A one-line output preview is human words, never JSON (walk 2026-10-07: the
// mandate Runs table printed `{"__kind":"directive_v1_action_create_agent_definition"…`).
import { outputPreviewLine } from "../output-preview-line";

describe("outputPreviewLine", () => {
  it("reads a cut directive batch as its first item's kind and name", () => {
    const cut =
      '{"__kind":"directive_v1_action_create_agent_definition","items":[{"__kind":"agent_definition","name":"Customer Support Agent Architect","description":"Designs a complete, production-ready customer support agent blueprint for any business — ';
    expect(outputPreviewLine(cut)).toBe("Agent definition: Customer Support Agent Architect");
  });

  it("reads a complete kind as its kind name plus its title", () => {
    expect(outputPreviewLine('{"__kind":"agent_definition","name":"Supplier Invoice Checker"}')).toBe(
      "Agent definition: Supplier Invoice Checker",
    );
    expect(outputPreviewLine('{"__kind":"flashcard_set","title":"Cells","cards":[]}')).toBe("Flashcard set: Cells");
  });

  it("reads a kind with no title as its kind name, and a lone directive as its action", () => {
    expect(outputPreviewLine('{"__kind":"flashcard_set","cards":[]}')).toBe("Flashcard set");
    expect(outputPreviewLine('{"__kind":"directive_v1_action_create_agent_definition","ite')).toBe(
      "Create agent definition",
    );
  });

  it("never returns raw JSON for kindless JSON", () => {
    expect(outputPreviewLine('{"title":"Quarterly plan","rows":[1,2]}')).toBe("Quarterly plan");
    expect(outputPreviewLine('{"rows":[1,2],"total":')).toBe("Structured output");
    expect(outputPreviewLine("[1,2,3]")).toBe("Structured output");
  });

  it("reads a fenced kind (cut mid-fence) as the kind, never the fence", () => {
    expect(outputPreviewLine('```json\n{"__kind":"agent_definition","name":"Supplier Invoice Checker","descr')).toBe(
      "Agent definition: Supplier Invoice Checker",
    );
    // The run history's preview collapses newlines: "```json { …".
    expect(
      outputPreviewLine('```json { "__kind": "directive_v1_action_create_agent_definition", "items": [ { "__kind": "agent_definition", "name": "Supplier Invoice Checker", "desc'),
    ).toBe("Agent definition: Supplier Invoice Checker");
  });

  it("reads text as its first non-empty line", () => {
    expect(outputPreviewLine("\n\nThe invoice matches.\nSecond line")).toBe("The invoice matches.");
    expect(outputPreviewLine(null)).toBe("");
  });
});
