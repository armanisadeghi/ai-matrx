import { signupErrorMessage } from "./auth-error-copy";

describe("signupErrorMessage", () => {
  it("turns the provider email limit into an actionable signup message", () => {
    expect(
      signupErrorMessage(
        "over_email_send_rate_limit",
        "email rate limit exceeded",
      ),
    ).toBe(
      "We couldn't send another confirmation email right now. Check whether an earlier confirmation email arrived, or wait a little while and try again.",
    );
  });

  it("preserves an unrecognized provider message", () => {
    expect(signupErrorMessage("weak_password", "Password is too weak")).toBe(
      "Password is too weak",
    );
  });
});
