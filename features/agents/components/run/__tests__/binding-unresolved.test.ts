import { bindingUnresolvedFailure } from "../friendlyStreamError";

describe("bindingUnresolvedFailure — a run refused for missing bound data", () => {
  it("uses the server's plain sentence for binding_unresolved", () => {
    const out = bindingUnresolvedFailure({
      errorType: "binding_unresolved",
      userMessage:
        "This agent needs “roster” from Coaches, which has no rows yet.",
      details: { variable: "roster", table_name: "Coaches", retryable: false },
    });
    expect(out).toEqual({
      message: "This agent needs “roster” from Coaches, which has no rows yet.",
      variable: "roster",
      tableName: "Coaches",
    });
  });

  it("never repeats the old 'failed unexpectedly … try again' wording", () => {
    const out = bindingUnresolvedFailure({
      userMessage:
        "Manual failed unexpectedly (ScopeBindingUnresolved). Please try again or adjust your settings.",
    });
    expect(out).not.toBeNull();
    expect(out?.message).not.toMatch(/try again|failed unexpectedly/i);
    expect(out?.message).toMatch(
      /change what happens when that data is missing/,
    );
  });

  it("composes an actionable sentence when the server sent none", () => {
    const out = bindingUnresolvedFailure({
      errorType: "binding_unresolved",
      details: { variable: "picks", table_name: "Model Picks" },
    });
    expect(out?.message).toBe(
      "This agent needs “picks” from Model Picks, which has no value right now. Fill it in, or change what happens when that data is missing.",
    );
  });

  it("leaves every other failure alone", () => {
    expect(
      bindingUnresolvedFailure({
        errorType: "invalid_request",
        userMessage: "Nope.",
      }),
    ).toBeNull();
  });
});
