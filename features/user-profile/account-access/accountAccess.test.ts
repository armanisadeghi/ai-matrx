import { emailChangeCallback, readAccountAccess, requestEmailChange, signOutOtherSessions } from "./accountAccess";

function client(user: { email?: string; new_email?: string } | null, error: Error | null = null) {
  const auth = {
    getUser: jest.fn(async () => ({ data: { user }, error })),
    updateUser: jest.fn(async () => ({ error: null })),
    signOut: jest.fn(async () => ({ error: null })),
  };
  return { auth };
}

describe("account access controls", () => {
  it("uses the verified email-change callback and refreshes auth after the request", async () => {
    const subject = client({ email: "owner@harbor.test" });
    await requestEmailChange("new@harbor.test", "https://www.aimatrx.com", subject as never);
    expect(subject.auth.updateUser).toHaveBeenCalledWith(
      { email: "new@harbor.test" },
      { emailRedirectTo: "https://www.aimatrx.com/auth/confirm?redirectTo=%2Fuser-settings%2Faccount" },
    );
    expect(subject.auth.getUser).toHaveBeenCalledTimes(2);
  });

  it("does not issue an email change for the primary email", async () => {
    const subject = client({ email: "owner@harbor.test" });
    await expect(requestEmailChange("owner@harbor.test", "https://www.aimatrx.com", subject as never)).rejects.toThrow("Enter a different email address.");
    expect(subject.auth.updateUser).not.toHaveBeenCalled();
  });

  it("does not send another confirmation for an already pending email", async () => {
    const subject = client({ email: "owner@harbor.test", new_email: "new@harbor.test" });
    await expect(requestEmailChange("new@harbor.test", "https://www.aimatrx.com", subject as never)).rejects.toThrow("That email change is already waiting for confirmation.");
    expect(subject.auth.updateUser).not.toHaveBeenCalled();
  });

  it("keeps the current session when signing out other sessions", async () => {
    const subject = client({ email: "owner@harbor.test" });
    await signOutOtherSessions(subject as never);
    expect(subject.auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("refuses a stale or absent auth user", async () => {
    await expect(readAccountAccess(client(null, new Error("expired")) as never)).rejects.toThrow("expired");
  });

  it("builds the existing email confirmation route", () => {
    expect(emailChangeCallback("http://localhost:3001")).toBe("http://localhost:3001/auth/confirm?redirectTo=%2Fuser-settings%2Faccount");
  });
});
