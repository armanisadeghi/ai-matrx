import { parseProviderAccount } from "./service";

describe("parseProviderAccount", () => {
  it("maps the safe registry projection without requiring secret identifiers", () => {
    expect(
      parseProviderAccount({
        id: "account-1",
        provider_key: "google",
        environment_key: "production",
        issuer: null,
        account_kind: "developer",
        login_identity: "developer@example.com",
        login_identity_status: "verified",
        display_name: "Google Cloud",
        workspace_name: "AI Matrx",
        external_account_id: "project-name",
        status: "active",
        auth_method: "oauth2",
        login_url: "https://console.cloud.google.com/",
        last_verified_at: "2026-09-14T00:00:00Z",
        safe_notes: null,
        credential_count: 2,
        primary_credential_present: true,
      }),
    ).toMatchObject({
      id: "account-1",
      providerKey: "google",
      loginIdentity: "developer@example.com",
      loginIdentityStatus: "verified",
      credentialCount: 2,
      primaryCredentialPresent: true,
    });
  });

  it("rejects incomplete provider rows instead of silently rendering them", () => {
    expect(() => parseProviderAccount({ id: "account-1" })).toThrow(
      "Provider account registry returned an incomplete row.",
    );
  });
});
