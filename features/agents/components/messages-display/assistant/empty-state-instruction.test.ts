import {
  FILL_FORM_INSTRUCTION,
  TYPE_MESSAGE_INSTRUCTION,
  emptyStateInstruction,
} from "./empty-state-instruction";

// The feedback-triage agents carry five form fields (description, route,
// filed_type, filed_priority, comments) and a description.
describe("emptyStateInstruction", () => {
  it("a form-driven agent is told to fill in the fields, description or not", () => {
    expect(
      emptyStateInstruction({ formFieldCount: 5, hasDescription: true }),
    ).toBe(FILL_FORM_INSTRUCTION);
    expect(
      emptyStateInstruction({ formFieldCount: 5, hasDescription: false }),
    ).toBe(FILL_FORM_INSTRUCTION);
  });

  it("an agent with no form points at the composer only when nothing else speaks", () => {
    expect(
      emptyStateInstruction({ formFieldCount: 0, hasDescription: false }),
    ).toBe(TYPE_MESSAGE_INSTRUCTION);
    expect(
      emptyStateInstruction({ formFieldCount: 0, hasDescription: true }),
    ).toBeNull();
  });
});
