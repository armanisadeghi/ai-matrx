/**
 * A run saved as a test case keeps what the person TYPED, never the rendered
 * template. The stored first user message is the agent's user-message template
 * with every variable already substituted, so loading it as "user input" put
 * the whole template into the composer beside the same variables (2026-10-05).
 */
import { runTestCaseInputs } from "@/features/agents/samples/service";

const declared = new Set(["image_description", "brand_context"]);
const variables = {
  image_description: "Two people at a desk with a student loan statement",
  brand_context: "Viva España Solutions",
};
const renderedTemplate = [
  {
    type: "text",
    text:
      "Here is the Instagram post description to work from:\n\n" +
      variables.image_description +
      "\n\nBrand:\n" +
      variables.brand_context,
  },
  { type: "media", kind: "image", file_id: "11111111-1111-1111-1111-111111111111" },
] as const;

describe("runTestCaseInputs", () => {
  it("nothing typed (recorded as empty) yields no user input, keeps attachments", () => {
    const out = runTestCaseInputs(
      { ...variables, __agent_user_input__: "" },
      declared,
      [...renderedTemplate],
    );
    expect(out.userInput).toBeNull();
    expect(out.variables).toEqual(variables);
    expect(out.inputContent).toEqual([renderedTemplate[1]]);
  });

  it("typed text is exactly what was typed, not the stored message", () => {
    const out = runTestCaseInputs(
      { ...variables, __agent_user_input__: "Make each concept different" },
      declared,
      [...renderedTemplate],
    );
    expect(out.userInput).toBe("Make each concept different");
    expect(out.inputContent).toEqual([
      expect.objectContaining({ type: "text", text: "Make each concept different" }),
      renderedTemplate[1],
    ]);
  });

  it("an old run with variables and no recorded key never takes the template", () => {
    const out = runTestCaseInputs(variables, declared, [...renderedTemplate]);
    expect(out.userInput).toBeNull();
    expect(out.inputContent).toEqual([renderedTemplate[1]]);
  });

  it("a run with no variables keeps its message text as the typed text", () => {
    const out = runTestCaseInputs({}, new Set(), [
      { type: "text", text: "plain chat question" },
    ]);
    expect(out.userInput).toBe("plain chat question");
  });
});
