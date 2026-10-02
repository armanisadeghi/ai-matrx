import { isValidOAuthState } from "../state";

describe("isValidOAuthState", () => {
  it("accepts the exact non-empty state returned by the provider", () => {
    expect(isValidOAuthState("expected-state", "expected-state")).toBe(true);
  });

  it.each([
    ["expected-state", null],
    ["expected-state", "different-state"],
    ["", ""],
    [null, "expected-state"],
    [undefined, "expected-state"],
  ])("rejects an absent, malformed, or mismatched state", (expected, returned) => {
    expect(isValidOAuthState(expected, returned)).toBe(false);
  });
});
