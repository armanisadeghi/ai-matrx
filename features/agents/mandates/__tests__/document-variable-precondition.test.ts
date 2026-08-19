/**
 * DISEASE D4 — "structured content arriving as a tool call, not a bound
 * variable" (`common-docs/operations/agent-failure-diseases.md`).
 *
 * Arman, 2026-08-19, on the live `masterwork_conductor` blind test: *"this
 * agent should never have even started without getting the rules in place."*
 *
 * These pin the RUN-TIME half of the Mandate contract: a Mandate's
 * `required_variables` bind the CALLER, and a run whose required document
 * variable is absent or blank REFUSES. Without this the check was bind-time
 * only — the agent was verified to be ABLE to receive the document while
 * nothing verified that anyone SENT it.
 */

import {
  EMPTY_MANDATE_CONTRACT,
  missingRequiredVariables,
  missingVariablesMessage,
  parseMandateContract,
} from "../contract";

const contract = (required: string[], spill: string[] = []) => ({
  ...EMPTY_MANDATE_CONTRACT,
  requiredVariables: required,
  spillVariables: spill,
});

describe("parseMandateContract", () => {
  it("reads the four contract lists and ignores non-strings", () => {
    expect(
      parseMandateContract({
        required_variables: ["rulebook_document", 7, null],
        required_context_policies: ["policy"],
        required_output_keys: ["findings"],
        spill_variables: ["mode"],
      }),
    ).toEqual({
      requiredVariables: ["rulebook_document"],
      requiredContextPolicyKeys: ["policy"],
      requiredOutputKeys: ["findings"],
      spillVariables: ["mode"],
    });
  });

  it("is empty for a null/garbage contract rather than throwing", () => {
    expect(parseMandateContract(null)).toEqual(EMPTY_MANDATE_CONTRACT);
    expect(parseMandateContract("nope" as never)).toEqual(EMPTY_MANDATE_CONTRACT);
  });
});

describe("missingRequiredVariables — the run-time precondition", () => {
  it("passes when every required variable carries real content", () => {
    expect(
      missingRequiredVariables(contract(["rulebook_document"]), {
        rulebook_document: "# Their Rulebook\n...",
      }),
    ).toEqual([]);
  });

  it("REFUSES when the required document was never supplied", () => {
    expect(
      missingRequiredVariables(contract(["rulebook_document"]), {
        rulebook_id: "8d1d4f08-c4c0-4e1d-ba9a-51d5d7bf69fb",
      }),
    ).toEqual(["rulebook_document"]);
  });

  it("REFUSES on a blank string — the exact shape of a wiring failure", () => {
    // A Rulebook with no rules yet must still render words saying so; an
    // empty string means the value never arrived, not that it is empty.
    expect(
      missingRequiredVariables(contract(["rulebook_document"]), {
        rulebook_document: "   ",
      }),
    ).toEqual(["rulebook_document"]);
  });

  it("REFUSES on null/undefined and on a missing variables object entirely", () => {
    expect(
      missingRequiredVariables(contract(["a", "b"]), { a: null, b: undefined }),
    ).toEqual(["a", "b"]);
    expect(missingRequiredVariables(contract(["a"]), undefined)).toEqual(["a"]);
  });

  it("does not refuse a SPILLED variable — it arrives as user text", () => {
    expect(
      missingRequiredVariables(contract(["mode"], ["mode"]), {}),
    ).toEqual([]);
  });

  it("accepts non-string values (a number or object still arrived)", () => {
    expect(
      missingRequiredVariables(contract(["count"]), { count: 0 }),
    ).toEqual([]);
  });

  it("names the missing variables in the refusal message", () => {
    const message = missingVariablesMessage("masterwork.conductor", [
      "rulebook_document",
    ]);
    expect(message).toContain("masterwork.conductor");
    expect(message).toContain("rulebook_document");
    expect(message).toContain("Refusing");
  });
});
