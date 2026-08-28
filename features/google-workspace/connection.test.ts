import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import {
  eligibleGoogleConnections,
  preferredGoogleConnectionId,
  rememberGoogleConnection,
  selectGoogleConnection,
} from "./connection";

function connection(
  id: string,
  email: string,
  overrides: Partial<GoogleConnectionSummary> = {},
): GoogleConnectionSummary {
  return {
    id,
    owner_type: "user",
    owner_user_id: "user-1",
    organization_id: null,
    provider: "google",
    provider_subject: `subject-${id}`,
    account_email: email,
    account_name: null,
    scopes: [GOOGLE_SCOPE.driveFile],
    status: "connected",
    last_verified_at: "2026-08-28T00:00:00Z",
    last_error: null,
    created_at: "2026-08-28T00:00:00Z",
    updated_at: "2026-08-28T00:00:00Z",
    metadata: {},
    credential_present: true,
    credential_stable: true,
    health: "connected",
    ...overrides,
  };
}

describe("Google account selection", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps distinct eligible Google identities available", () => {
    const first = connection("first", "first@example.com");
    const second = connection("second", "second@example.com");

    expect(eligibleGoogleConnections([first, second], "workspace")).toEqual([
      first,
      second,
    ]);
  });

  it("collapses personal and organization rows for the same Google identity", () => {
    const personal = connection("personal", "same@example.com", {
      provider_subject: "same-subject",
    });
    const organization = connection("organization", "same@example.com", {
      provider_subject: "same-subject",
      owner_type: "organization",
      organization_id: "org-1",
    });

    expect(
      eligibleGoogleConnections(
        [personal, organization],
        "workspace",
        personal.id,
      ),
    ).toEqual([personal]);
  });

  it("excludes unhealthy and wrong-scope connections", () => {
    const healthy = connection("healthy", "healthy@example.com");
    const unhealthy = connection("unhealthy", "bad@example.com", {
      health: "needs_reauth",
    });
    const gmailOnly = connection("gmail", "gmail@example.com", {
      scopes: [GOOGLE_SCOPE.gmailSend],
    });

    expect(
      eligibleGoogleConnections([unhealthy, gmailOnly, healthy], "workspace"),
    ).toEqual([healthy]);
  });

  it("honors an explicit valid account and safely falls back when it disappears", () => {
    const first = connection("first", "first@example.com");
    const second = connection("second", "second@example.com");

    expect(
      selectGoogleConnection([first, second], "workspace", second.id)?.id,
    ).toBe(second.id);
    expect(selectGoogleConnection([first], "workspace", second.id)?.id).toBe(
      first.id,
    );
  });

  it("stores separate safe preferences for Workspace and Gmail", () => {
    rememberGoogleConnection("workspace", "workspace-connection");
    rememberGoogleConnection("gmail-send", "gmail-connection");

    expect(preferredGoogleConnectionId("workspace")).toBe(
      "workspace-connection",
    );
    expect(preferredGoogleConnectionId("gmail-send")).toBe("gmail-connection");
  });
});
