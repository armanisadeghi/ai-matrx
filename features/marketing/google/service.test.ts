import {
  connectionResource,
  isGoogleConnectionReachableByUser,
  isStaleGoogleConnectionSelection,
  type GoogleConnectionPurpose,
} from "@/features/marketing/google/service";
import { BackendApiError } from "@/lib/api/errors";
import { GOOGLE_CONNECTION_SCOPES } from "@/features/marketing/google/types";
import {
  GOOGLE_ADS_REPORTING_SCOPES,
  GOOGLE_ANALYTICS_SCOPES,
  GOOGLE_CALENDAR_AGENDA_SCOPES,
  GOOGLE_CONTACTS_IMPORT_SCOPES,
  GOOGLE_READ_ONLY_SWEEP_CLOUD_SCOPES,
  GOOGLE_READ_ONLY_SWEEP_SCOPES,
  GOOGLE_SCOPE,
  GOOGLE_TAG_MANAGER_SCOPES,
  GOOGLE_TASKS_IMPORT_SCOPES,
  GOOGLE_YOUTUBE_ANALYTICS_SCOPES,
} from "@/lib/googleScopes";

const baseResource = {
  id: "resource-1",
  connection_id: "connection-1",
  resource_ref: "UC-channel-1",
  display_name: "Channel One",
  permission_level: "owner",
  discovered_at: "2026-07-25T00:00:00Z",
  metadata: { uploads_playlist_id: "UU-channel-1" },
};

describe("Google OAuth connection resources", () => {
  it("excludes admin-visible Google connections the caller cannot reach", () => {
    const connection = {
      id: "connection-1",
      owner_type: "user" as const,
      owner_user_id: "other-user",
      organization_id: null,
      provider: "google" as const,
      provider_subject: "subject-1",
      account_email: "other@example.com",
      account_name: null,
      scopes: [GOOGLE_SCOPE.tasksReadonly],
      status: "connected" as const,
      last_verified_at: null,
      last_error: null,
      created_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
      metadata: {},
      credential_present: true,
      credential_stable: true,
      health: "connected" as const,
    };

    expect(
      isGoogleConnectionReachableByUser(connection, "reviewer", ["org-1"]),
    ).toBe(false);
    expect(
      isGoogleConnectionReachableByUser(
        { ...connection, owner_user_id: "reviewer" },
        "reviewer",
        [],
      ),
    ).toBe(true);
    expect(
      isGoogleConnectionReachableByUser(
        { ...connection, organization_id: "org-1" },
        "reviewer",
        ["org-1"],
      ),
    ).toBe(true);
  });

  it.each([403, 404])(
    "treats HTTP %s after inventory selection as stale access control flow",
    (status) => {
      expect(
        isStaleGoogleConnectionSelection(
          new BackendApiError({
            code: status === 403 ? "forbidden" : "not_found",
            detail: "selection is no longer reachable",
            userMessage: "Selection unavailable",
            status,
          }),
        ),
      ).toBe(true);
    },
  );

  it("keeps provider and server failures on the captured error path", () => {
    expect(
      isStaleGoogleConnectionSelection(
        new BackendApiError({
          code: "internal_error",
          detail: "provider failed",
          userMessage: "Please try again",
          status: 500,
        }),
      ),
    ).toBe(false);
    expect(isStaleGoogleConnectionSelection(new Error("network"))).toBe(false);
  });

  it("preserves YouTube channels as first-class resources", () => {
    expect(
      connectionResource({
        ...baseResource,
        resource_type: "youtube_channel",
      }),
    ).toMatchObject({
      resource_type: "youtube_channel",
      resource_ref: "UC-channel-1",
      display_name: "Channel One",
      metadata: { uploads_playlist_id: "UU-channel-1" },
    });
  });

  it.each(["google_document", "google_spreadsheet"] as const)(
    "accepts Picker-selected %s resources",
    (resourceType) => {
      expect(
        connectionResource({
          ...baseResource,
          resource_type: resourceType,
          resource_ref: "selected-file-1",
        }),
      ).toMatchObject({
        resource_type: resourceType,
        resource_ref: "selected-file-1",
      });
    },
  );

  it("fails loudly for an unknown resource type", () => {
    expect(() =>
      connectionResource({
        ...baseResource,
        resource_type: "invented_google_resource",
      }),
    ).toThrow("Unknown Google connection resource type");
  });

  it("keeps marketing authorization limited to Search Console", () => {
    expect(GOOGLE_CONNECTION_SCOPES).toContain(GOOGLE_SCOPE.webmastersReadonly);
    expect(GOOGLE_CONNECTION_SCOPES).not.toContain(
      GOOGLE_SCOPE.analyticsReadonly,
    );
    expect(GOOGLE_CONNECTION_SCOPES).not.toContain(
      GOOGLE_SCOPE.youtubeReadonly,
    );
    expect(new Set(GOOGLE_CONNECTION_SCOPES).size).toBe(
      GOOGLE_CONNECTION_SCOPES.length,
    );
  });

  it("requests Analytics only from the explicit incremental GA4 action", () => {
    expect(GOOGLE_ANALYTICS_SCOPES).toContain(GOOGLE_SCOPE.analyticsReadonly);
    expect(GOOGLE_ANALYTICS_SCOPES).toContain(GOOGLE_SCOPE.webmastersReadonly);
    expect(new Set(GOOGLE_ANALYTICS_SCOPES).size).toBe(
      GOOGLE_ANALYTICS_SCOPES.length,
    );
  });

  it("keeps Google Ads in its isolated one-product grant", () => {
    expect(GOOGLE_ADS_REPORTING_SCOPES).toContain(GOOGLE_SCOPE.googleAds);
    expect(GOOGLE_ADS_REPORTING_SCOPES).not.toContain(
      GOOGLE_SCOPE.analyticsReadonly,
    );
    expect(GOOGLE_ADS_REPORTING_SCOPES).not.toContain(
      GOOGLE_SCOPE.youtubeReadonly,
    );
    expect(GOOGLE_ADS_REPORTING_SCOPES).not.toContain(GOOGLE_SCOPE.driveFile);
  });

  it("keeps every read-only sweep action focused on its own product", () => {
    expect(GOOGLE_CONTACTS_IMPORT_SCOPES).toContain(
      GOOGLE_SCOPE.contactsReadonly,
    );
    expect(GOOGLE_CALENDAR_AGENDA_SCOPES).toContain(
      GOOGLE_SCOPE.calendarEventsOwnedReadonly,
    );
    expect(GOOGLE_TASKS_IMPORT_SCOPES).toContain(GOOGLE_SCOPE.tasksReadonly);
    expect(GOOGLE_YOUTUBE_ANALYTICS_SCOPES).toEqual(
      expect.arrayContaining([
        GOOGLE_SCOPE.youtubeReadonly,
        GOOGLE_SCOPE.youtubeAnalyticsReadonly,
      ]),
    );
    expect(GOOGLE_TAG_MANAGER_SCOPES).toContain(
      GOOGLE_SCOPE.tagManagerReadonly,
    );

    for (const family of [
      GOOGLE_CONTACTS_IMPORT_SCOPES,
      GOOGLE_CALENDAR_AGENDA_SCOPES,
      GOOGLE_TASKS_IMPORT_SCOPES,
      GOOGLE_YOUTUBE_ANALYTICS_SCOPES,
      GOOGLE_TAG_MANAGER_SCOPES,
    ]) {
      expect(family).not.toContain(GOOGLE_SCOPE.googleAds);
      expect(family).not.toContain(GOOGLE_SCOPE.gmailReadonly);
      expect(new Set(family).size).toBe(family.length);
    }
  });

  it("keeps Cloud Data Access parity explicit for the read-only sweep", () => {
    expect(new Set(GOOGLE_READ_ONLY_SWEEP_CLOUD_SCOPES)).toEqual(
      new Set([
        GOOGLE_SCOPE.contactsReadonly,
        GOOGLE_SCOPE.calendarEventsOwnedReadonly,
        GOOGLE_SCOPE.tasksReadonly,
        GOOGLE_SCOPE.youtubeAnalyticsReadonly,
        GOOGLE_SCOPE.tagManagerReadonly,
      ]),
    );
  });

  it("authorizes the read-only sweep as one complete runtime credential", () => {
    expect(GOOGLE_READ_ONLY_SWEEP_SCOPES).toEqual(
      expect.arrayContaining([
        ...GOOGLE_READ_ONLY_SWEEP_CLOUD_SCOPES,
        GOOGLE_SCOPE.youtubeReadonly,
      ]),
    );
    expect(GOOGLE_READ_ONLY_SWEEP_SCOPES).not.toContain(GOOGLE_SCOPE.googleAds);
    expect(GOOGLE_READ_ONLY_SWEEP_SCOPES).not.toContain(
      GOOGLE_SCOPE.gmailReadonly,
    );
    expect(GOOGLE_READ_ONLY_SWEEP_SCOPES).not.toContain(GOOGLE_SCOPE.driveFile);
    expect(new Set(GOOGLE_READ_ONLY_SWEEP_SCOPES).size).toBe(
      GOOGLE_READ_ONLY_SWEEP_SCOPES.length,
    );
  });

  it("keeps the guarded read-only exchange purpose available during staggered deploys", () => {
    const purpose: GoogleConnectionPurpose = "read_only_sweep";
    expect(purpose).toBe("read_only_sweep");
  });
});
