/**
 * A 409/422/403 whose body says exactly what refused must reach the person as
 * that sentence, not as the envelope's generic "Something went wrong". The
 * Group Chat policy edit hit it. The fix lives in `@ai-matrx/agents/matrx`
 * (`extractMatrxErrorMessage`, >= 0.43.19); this pins that callApi's error path
 * still gets it, so a package regression is caught here.
 */
import { extractMatrxErrorMessage } from "@ai-matrx/agents/matrx";

describe("the server's precise message beats a generic user_message", () => {
  it("prefers the body's message", () => {
    expect(
      extractMatrxErrorMessage({
        error: "conflict",
        message: "Policy changed elsewhere (version 4, expected 3)",
        user_message: "Something went wrong. Please try again later.",
      }),
    ).toBe("Policy changed elsewhere (version 4, expected 3)");
  });

  it("reads a FastAPI string detail past a generic user_message", () => {
    expect(
      extractMatrxErrorMessage({
        user_message: "Something went wrong",
        detail: "A narrator cannot see nothing",
      }),
    ).toBe("A narrator cannot see nothing");
  });

  it("keeps a specific user_message", () => {
    expect(
      extractMatrxErrorMessage({
        user_message: "Participant is not in this group",
        message: "other",
      }),
    ).toBe("Participant is not in this group");
  });

  it("keeps the generic line when the body has nothing better", () => {
    expect(
      extractMatrxErrorMessage({ user_message: "Something went wrong" }),
    ).toBe("Something went wrong");
  });
});
