import {
  makeGovernedDataAsserter,
  operationFailed,
} from "./errors";

describe("governed data errors", () => {
  const assertGoverned = makeGovernedDataAsserter(
    "save these settings",
    /^(gsc_vocab_[a-z_]+|seo_settings_[a-z_]+):\s*/,
  );

  it("surfaces an allow-listed governance sentence and preserves its cause", () => {
    const cause = {
      code: "P0001",
      message: "gsc_vocab_missing_negative: The reserved Negative level must stay.",
    };

    expect(() => assertGoverned(null, cause)).toThrow(
      "The reserved Negative level must stay.",
    );
    try {
      assertGoverned(null, cause);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).cause).toBe(cause);
    }
  });

  it("keeps unrecognized database failures behind the action message", () => {
    const cause = { code: "XX000", message: "planner internals" };
    expect(() => assertGoverned(null, cause)).toThrow(
      operationFailed("save these settings").message,
    );
  });
});
