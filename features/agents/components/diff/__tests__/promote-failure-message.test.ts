import { promoteFailureMessage } from "../promote-failure-message";

describe("promoteFailureMessage", () => {
  it("names the server's refusal instead of a bare generic sentence", () => {
    const refusal = new Error("agent_access_denied: no access to that agent");
    expect(promoteFailureMessage(refusal)).toBe(
      "Failed to promote version: agent_access_denied: no access to that agent",
    );
  });

  it("reads the message off a plain error object (PostgREST shape)", () => {
    expect(promoteFailureMessage({ message: "boom", code: "42501" })).toContain(
      "boom",
    );
  });

  it("falls back to the generic sentence only when there is no reason at all", () => {
    expect(promoteFailureMessage(undefined)).toBe("Failed to promote version");
    expect(promoteFailureMessage(new Error(""))).toBe(
      "Failed to promote version",
    );
  });
});
