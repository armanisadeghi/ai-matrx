import {
  accountFingerprint,
  NO_ACCOUNT_IDENTITY,
  providerAccountIdentity,
  recordedCapabilityLabels,
  workspaceName,
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

  it("prefers the display-safe provider_account_label for display", () => {
    const identity = providerAccountIdentity({
      provider_account_label: "Work Claude (arman)",
      source_metadata: { provider_account_key: "acct_key_9" },
    });
    expect(identity.label).toBe("Work Claude (arman)");
    expect(identity.fingerprint).toBe("acct_key_9");
    expect(identity.display).toBe("Work Claude (arman)");
    expect(identity.reported).toBe(true);
  });

  it("prefers the canonical provider_account_key over legacy fingerprints", () => {
    const identity = providerAccountIdentity({
      provider_account_key: "canonical_key",
      account_fingerprint: "legacy_fp",
    });
    expect(identity.fingerprint).toBe("canonical_key");
    expect(identity.display).toBe("canonical_key");
  });

  it("reads the label from nested source_metadata", () => {
    const identity = providerAccountIdentity({
      source_metadata: { provider_account_label: "Personal Claude" },
    });
    expect(identity.display).toBe("Personal Claude");
    expect(identity.fingerprint).toBeNull();
  });

  it("states the honest absence when nothing identity-shaped is reported", () => {
    const identity = providerAccountIdentity({
      email: "secret@example.com",
      access_token: "do-not-render",
    });
    expect(identity.label).toBeNull();
    expect(identity.fingerprint).toBeNull();
    expect(identity.display).toBe(NO_ACCOUNT_IDENTITY);
    expect(identity.reported).toBe(false);
    expect(providerAccountIdentity(null).display).toBe(NO_ACCOUNT_IDENTITY);
  });

  it("reads the workspace name tolerantly and returns null when absent", () => {
    expect(workspaceName({ workspace_name: "common-docs" })).toBe(
      "common-docs",
    );
    expect(
      workspaceName({ source_metadata: { workspace_name: "aidream" } }),
    ).toBe("aidream");
    expect(workspaceName({ workspace_name: "  " })).toBeNull();
    expect(workspaceName({ email: "secret@example.com" })).toBeNull();
    expect(workspaceName(null)).toBeNull();
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
