/**
 * Connection health must state the CAUSE, and must never call a credential-less
 * row "connected" — the exact state behind the 2026-07-25 silent GSC failures.
 */
import {
  dedupeGoogleConnectionsForPicker,
  diagnoseGoogleConnection,
  googleConnectionDiagnostics,
} from "./health";
import type { GoogleConnectionSummary } from "./types";

function connection(
  overrides: Partial<GoogleConnectionSummary> = {},
): GoogleConnectionSummary {
  return {
    id: "7223fed4-7296-4f1e-9126-a83a96a917e9",
    owner_type: "user",
    owner_user_id: "4cf62e4e-2679-484f-b652-034e697418df",
    organization_id: null,
    provider: "google",
    provider_subject: "10293847",
    account_email: "arman@armansadeghi.com",
    account_name: null,
    scopes: ["openid", "https://www.googleapis.com/auth/webmasters.readonly"],
    status: "connected",
    last_verified_at: "2026-07-19T20:07:27.780Z",
    last_error: null,
    created_at: "2026-07-19T20:07:27.780Z",
    updated_at: "2026-07-19T20:07:27.780Z",
    metadata: {},
    credential_present: true,
    credential_stable: true,
    health: "connected",
    ...overrides,
  };
}

describe("diagnoseGoogleConnection", () => {
  it("names the missing vault credential and the fix (the incident row)", () => {
    const diagnosis = diagnoseGoogleConnection(
      connection({
        credential_present: false,
        credential_stable: false,
        health: "needs_reauth",
      }),
    );
    expect(diagnosis.label).toBe("Needs re-authentication");
    expect(diagnosis.blocking).toBe(true);
    expect(diagnosis.reason).toContain("no vault credential");
    expect(diagnosis.reason).toContain("arman@armansadeghi.com");
    expect(diagnosis.remedy).toContain("Reconnect");
  });

  it("never reports a stored status of connected as healthy without a credential", () => {
    // The DB row literally said status='connected' during the outage.
    const diagnosis = diagnoseGoogleConnection(
      connection({ status: "connected", credential_present: false, health: "needs_reauth" }),
    );
    expect(diagnosis.blocking).toBe(true);
    expect(diagnosis.label).not.toBe("Connected");
  });

  it("surfaces the server-recorded reason for a flagged connection", () => {
    const diagnosis = diagnoseGoogleConnection(
      connection({
        status: "needs_attention",
        health: "needs_reauth",
        last_error: "invalid_grant from Google token refresh",
      }),
    );
    expect(diagnosis.reason).toBe("invalid_grant from Google token refresh");
  });

  it("still explains a flagged connection that recorded no reason", () => {
    const diagnosis = diagnoseGoogleConnection(
      connection({ status: "needs_attention", health: "needs_reauth", last_error: null }),
    );
    expect(diagnosis.reason).toContain("recorded no reason");
  });

  it("flags the deprecated legacy-key path without blocking work", () => {
    const diagnosis = diagnoseGoogleConnection(
      connection({ credential_stable: false }),
    );
    expect(diagnosis.label).toBe("Legacy credential");
    expect(diagnosis.blocking).toBe(false);
  });

  it("reports a healthy connection plainly", () => {
    const diagnosis = diagnoseGoogleConnection(connection());
    expect(diagnosis.label).toBe("Connected");
    expect(diagnosis.blocking).toBe(false);
    expect(diagnosis.remedy).toBeNull();
  });
});

describe("googleConnectionDiagnostics", () => {
  it("exposes the credential state and never a secret value", () => {
    const rows = new Map(
      googleConnectionDiagnostics(
        connection({ credential_present: false, health: "needs_reauth" }),
      ),
    );
    expect(rows.get("Vault credential")).toBe("MISSING");
    expect(rows.get("Stored status")).toBe("connected");
    expect(rows.get("Derived health")).toBe("needs_reauth");
    expect([...rows.keys()]).not.toContain("Refresh token");
  });
});

describe("dedupeGoogleConnectionsForPicker", () => {
  it("collapses a personal + org connection to the SAME Google account into one entry", () => {
    const personal = connection({ id: "conn-personal" });
    const org = connection({
      id: "conn-org",
      owner_type: "organization",
      owner_user_id: null,
      organization_id: "org-1",
    });
    const deduped = dedupeGoogleConnectionsForPicker([personal, org]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe("conn-org"); // healthy org-owned preferred
  });

  it("never hides the currently-bound connection", () => {
    const personal = connection({ id: "conn-personal" });
    const org = connection({
      id: "conn-org",
      owner_type: "organization",
      owner_user_id: null,
      organization_id: "org-1",
    });
    const deduped = dedupeGoogleConnectionsForPicker(
      [personal, org],
      "conn-personal",
    );
    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe("conn-personal");
  });

  it("prefers a healthy connection over an unhealthy org one", () => {
    const broken = connection({
      id: "conn-broken",
      owner_type: "organization",
      owner_user_id: null,
      organization_id: "org-1",
      health: "needs_reauth",
      credential_present: false,
    });
    const healthy = connection({ id: "conn-healthy" });
    const deduped = dedupeGoogleConnectionsForPicker([broken, healthy]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe("conn-healthy");
  });

  it("keeps distinct Google accounts as distinct entries", () => {
    const a = connection({ id: "conn-a", provider_subject: "subject-a" });
    const b = connection({ id: "conn-b", provider_subject: "subject-b" });
    expect(dedupeGoogleConnectionsForPicker([a, b])).toHaveLength(2);
  });
});
