/**
 * A 409/422/403 whose body says exactly what refused must reach the person as
 * that sentence, not as the envelope's generic "Something went wrong". The
 * Group Chat policy edit hit it: the server's `message` was precise, its
 * `user_message` was generic, and the shared core preferred `user_message`.
 */
import { withPreciseServerMessage } from "../call-api";

const error = (message: string, serverDetail: unknown, status = 409) =>
  ({ type: "validation_error", message, status, serverDetail }) as never;

describe("withPreciseServerMessage", () => {
  it("replaces a generic user_message with the body's precise message", () => {
    const out = withPreciseServerMessage(
      error("Something went wrong. Please try again later.", {
        error: "conflict",
        message: "Policy changed elsewhere (version 4, expected 3)",
        user_message: "Something went wrong. Please try again later.",
      }),
    );
    expect(out.message).toBe("Policy changed elsewhere (version 4, expected 3)");
    expect(out.status).toBe(409);
  });

  it("reads a FastAPI string detail", () => {
    const out = withPreciseServerMessage(
      error("Request failed (422)", { detail: "A narrator cannot see nothing" }, 422),
    );
    expect(out.message).toBe("A narrator cannot see nothing");
  });

  it("leaves an already-specific message alone", () => {
    const e = error("Participant is not in this group", { message: "other" });
    expect(withPreciseServerMessage(e)).toBe(e);
  });

  it("keeps the generic line when the body has nothing better", () => {
    const e = error("Something went wrong", { user_message: "Something went wrong" }, 500);
    expect(withPreciseServerMessage(e).message).toBe("Something went wrong");
  });
});
