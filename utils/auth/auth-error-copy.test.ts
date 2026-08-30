import { signupErrorMessage } from "./auth-error-copy";

describe("signupErrorMessage", () => {
  it("turns the provider email limit into an actionable signup message", () => {
    expect(
      signupErrorMessage(
        "over_email_send_rate_limit",
        "email rate limit exceeded",
      ),
    ).toBe(
      "We couldn't create this account because too many confirmation emails were requested recently. No account was created by this attempt. Please wait a few minutes, then try again.",
    );
  });

  it("preserves an unrecognized provider message", () => {
    expect(signupErrorMessage("weak_password", "Password is too weak")).toBe(
      "Password is too weak",
    );
  });
});
