import { toolCheckFailure } from "../integration-tool-check";

describe("integration tool check failure", () => {
  it("does not expose a serialized thunk error as object text", () => {
    const message = toolCheckFailure({ name: "Rejected", detail: { code: "unavailable" } });
    expect(message).toMatch(/Try again/);
    expect(message).not.toMatch(/object Object|\{"/);
  });

  it("retains an actionable service explanation", () => {
    expect(toolCheckFailure({ message: "This service is temporarily unavailable." }))
      .toBe("This service is temporarily unavailable.");
  });

  it("does not print a JSON response body", () => {
    expect(toolCheckFailure(new Error('{"detail":{"error":"failed"}}')))
      .toMatch(/Try again/);
  });
});
