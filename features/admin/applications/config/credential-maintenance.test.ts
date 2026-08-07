import {
  credentialMaintenanceIndexPath,
  credentialMaintenancePath,
  credentialMaintenanceMapSchema,
  getCredentialExpiryStatus,
  recordCredentialRotation,
  type CredentialMaintenanceEntry,
} from "@/features/admin/applications/config/credential-maintenance";

const appleEntry: CredentialMaintenanceEntry = {
  label: "Apple Sign-In",
  generated_at: "2026-08-07T21:56:11.000Z",
  expires_at: "2027-02-03T21:56:11.000Z",
  warning_days: 14,
  validity_days: 180,
  key_id: "969RCLFTAR",
  source_url: "https://developer.apple.com/account/resources/authkeys/list",
  deployment_url:
    "https://supabase.com/dashboard/project/txzxabzwovsujtloxrus/auth/providers?provider=Apple",
};

describe("credential maintenance", () => {
  it("links reminders to the dedicated production admin host", () => {
    expect(credentialMaintenanceIndexPath()).toBe(
      "https://manage.aimatrx.com/administration/applications/configuration",
    );
    expect(credentialMaintenancePath("apple-sign-in")).toBe(
      "https://manage.aimatrx.com/administration/applications/configuration?app=ai-matrx&credential=apple-sign-in",
    );
  });

  it("distinguishes healthy, warning, and expired dates", () => {
    expect(
      getCredentialExpiryStatus(
        appleEntry,
        new Date("2027-01-19T21:56:11.000Z"),
      ).expiringSoon,
    ).toBe(false);
    expect(
      getCredentialExpiryStatus(
        appleEntry,
        new Date("2027-01-20T21:56:11.000Z"),
      ).expiringSoon,
    ).toBe(true);
    expect(
      getCredentialExpiryStatus(
        appleEntry,
        new Date("2027-02-03T21:56:11.000Z"),
      ).expired,
    ).toBe(true);
  });

  it("records the configured validity window without changing other metadata", () => {
    const rotated = recordCredentialRotation(
      appleEntry,
      new Date("2027-01-01T00:00:00.000Z"),
    );

    expect(rotated.generated_at).toBe("2027-01-01T00:00:00.000Z");
    expect(rotated.expires_at).toBe("2027-06-30T00:00:00.000Z");
    expect(rotated.key_id).toBe("969RCLFTAR");
  });

  it("rejects an expiry that precedes generation", () => {
    const parsed = credentialMaintenanceMapSchema.safeParse({
      apple: {
        ...appleEntry,
        expires_at: "2026-08-01T00:00:00.000Z",
      },
    });

    expect(parsed.success).toBe(false);
  });
});
