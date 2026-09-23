import {
  ACCOUNT_NOT_IDENTIFIED,
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

  // CS-23. Five chat.coding_session rows carried a masked label
  // (a***6@g***.com) written before 2026-09-07, and their account key is a
  // one-way digest over a Claude organization UUID we do not record, so the
  // real label is unrecoverable. Arman ruled a masked label is a lie, so
  // migration 0854 set both label locations to null and wrote
  // provider_account_label_note saying why. Nulling alone was not enough:
  // this reader falls back to the opaque 64-hex account key, which would put
  // a hex digest where a person expects an account name. The note has to win
  // over the fingerprint.
  it("says the account is not identified when the label was an unrecoverable mask", () => {
    const identity = providerAccountIdentity({
      provider_account_label: null,
      provider_account_label_note:
        "account not identified — original label was masked before 2026-09-07" +
        " and no unmasked record exists",
      provider_account_key:
        "c447d70fd623a3cfc761c5a55223982a36d9a1d888bb4e3799037bd88a205ee9",
      provider_account_fingerprint: "c447d70fd623",
      source_metadata: { provider_account_label: null },
    });
    expect(identity.label).toBeNull();
    expect(identity.display).toBe(ACCOUNT_NOT_IDENTIFIED);
    expect(identity.display).not.toContain("c447d70f");
    expect(identity.display).not.toContain("*");
    // The key is still there for grouping — it is only never the display.
    expect(identity.fingerprint).toBe(
      "c447d70fd623a3cfc761c5a55223982a36d9a1d888bb4e3799037bd88a205ee9",
    );
    // An identity WAS reported; it is the label that could not be recovered.
    expect(identity.reported).toBe(true);
  });

  it("reads the unrecoverable-label note from nested source_metadata too", () => {
    const identity = providerAccountIdentity({
      source_metadata: {
        provider_account_label_note: "account not identified — no unmasked record exists",
        provider_account_key: "acct_key_9",
      },
    });
    expect(identity.display).toBe(ACCOUNT_NOT_IDENTIFIED);
  });

  it("never lets the note outrank a real label", () => {
    const identity = providerAccountIdentity({
      provider_account_label: "dev@rinconplumbing.test",
      provider_account_label_note: "stale note left behind by an earlier repair",
    });
    expect(identity.display).toBe("dev@rinconplumbing.test");
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
