import {
  accountFingerprint,
  recordedCapabilityLabels,
} from "../lib/codingSessionPresentation";

describe("coding-session presentation", () => {
  it("reads only the explicit opaque account fingerprint fields", () => {
    expect(
      accountFingerprint({
        email: "secret@example.com",
        access_token: "do-not-render",
        source_metadata: { provider_account_fingerprint: "acct_123" },
      }),
    ).toBe("acct_123");
    expect(accountFingerprint({ email: "secret@example.com" })).toBeNull();
  });

  it("names only certified boolean capabilities", () => {
    expect(
      recordedCapabilityLabels({
        append_native: true,
        native_resume: false,
        native_fork: true,
        arbitrary: "ignored",
      }),
    ).toEqual(["Append native ledger", "Native fork recorded"]);
  });
});
