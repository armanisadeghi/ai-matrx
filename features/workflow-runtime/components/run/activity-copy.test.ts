import { warningCopy } from "./activity-copy";

describe("warningCopy", () => {
  it("reads the canonical structured warning summary", () => {
    expect(
      warningCopy(
        JSON.stringify({
          code: "model_retry",
          user_message: "The model is retrying automatically.",
          level: "medium",
          recoverable: true,
        }),
      ),
    ).toBe("The model is retrying automatically.");
  });

  it("uses the warning code when canonical JSON has no user message", () => {
    expect(
      warningCopy(
        JSON.stringify({
          code: "provider_overload_suspended",
          user_message: null,
          level: "high",
          recoverable: true,
        }),
      ),
    ).toBe("Provider overload suspended");
  });

  it("keeps the regex fallback for legacy mid-string JSON", () => {
    const legacy =
      '{"code":"model_retry","system_message":"internal","user_message":"The model encountered an issue and is retrying autom';

    expect(warningCopy(legacy)).toBe(
      "The model encountered an issue and is retrying autom",
    );
  });
});
