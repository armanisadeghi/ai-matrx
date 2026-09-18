import {
  connectionResource,
  buildGoogleReconnectRequest,
  cumulativeGoogleReconnectScopes,
  filterGoogleConnectionInventoryForUser,
  isGoogleConnectionReachableByUser,
  isStaleGoogleConnectionSelection,
  type GoogleConnectionPurpose,
} from "@/features/marketing/google/service";
import { BackendApiError } from "@/lib/api/errors";
import {
  GOOGLE_CONNECTION_SCOPES,
  GOOGLE_CONNECTION_RESOURCE_TYPES,
} from "@/features/marketing/google/types";
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
  it("reconnects an existing Analytics and YouTube grant without widening it", () => {
    const existing = [
      GOOGLE_SCOPE.openid,
      GOOGLE_SCOPE.userinfoEmail,
      GOOGLE_SCOPE.userinfoProfile,
      GOOGLE_SCOPE.analyticsReadonly,
      GOOGLE_SCOPE.youtubeReadonly,
    ];

    expect(cumulativeGoogleReconnectScopes(existing, [])).toEqual(existing);
    expect(
      cumulativeGoogleReconnectScopes(existing, [GOOGLE_SCOPE.youtubeReadonly]),
    ).toEqual(existing);
    expect(cumulativeGoogleReconnectScopes(existing, [])).not.toContain(
      GOOGLE_SCOPE.webmastersReadonly,
    );
  });

  it("targets the original connection and organization for a row reconnect", () => {
    const connection = {
      id: "connection-1",
      owner_type: "organization" as const,
      owner_user_id: null,
      organization_id: "original-org",
      provider: "google" as const,
      provider_subject: "subject-1",
      account_email: "owner@example.com",
      account_name: null,
      scopes: [GOOGLE_SCOPE.analyticsReadonly, GOOGLE_SCOPE.youtubeReadonly],
      status: "connected" as const,
      last_verified_at: null,
      last_error: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
      metadata: {},
      credential_present: true,
      credential_stable: true,
      capability_health: null,
      health: "connected" as const,
    };

    expect(buildGoogleReconnectRequest(connection)).toEqual({
      scopes: connection.scopes,
      loginHint: "owner@example.com",
      owner: { type: "organization", organizationId: "original-org" },
      options: { targetConnectionId: "connection-1" },
    });
  });

  it("adds one capability scope set while preserving the exact target", () => {
    const connection = {
      id: "connection-contacts",
      owner_type: "user" as const,
      owner_user_id: "user-1",
      organization_id: null,
      provider: "google" as const,
      provider_subject: "subject-contacts",
      account_email: "contacts@example.com",
      account_name: null,
      scopes: [GOOGLE_SCOPE.youtubeReadonly],
      status: "connected" as const,
      last_verified_at: null,
      last_error: null,
      created_at: "2026-09-15T00:00:00Z",
      updated_at: "2026-09-15T00:00:00Z",
      metadata: {},
      credential_present: true,
      credential_stable: true,
      capability_health: null,
      health: "connected" as const,
    };

    expect(
      buildGoogleReconnectRequest(
        connection,
        [GOOGLE_SCOPE.contactsReadonly],
        "contacts",
      ),
    ).toEqual({
      scopes: [GOOGLE_SCOPE.youtubeReadonly, GOOGLE_SCOPE.contactsReadonly],
      loginHint: "contacts@example.com",
      owner: { type: "user" },
      options: {
        targetConnectionId: "connection-contacts",
        capabilityKey: "contacts",
      },
    });
  });

  it("removes admin-visible foreign connections and their resources from picker inventory", () => {
    const connection = {
      id: "owned-connection",
      owner_type: "user" as const,
      owner_user_id: "reviewer",
      organization_id: null,
      provider: "google" as const,
      provider_subject: "subject-owned",
      account_email: "reviewer@example.com",
      account_name: null,
      scopes: [GOOGLE_SCOPE.driveFile],
      status: "connected" as const,
      last_verified_at: null,
      last_error: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
      metadata: {},
      credential_present: true,
      credential_stable: true,
      capability_health: null,
      health: "connected" as const,
    };
    const foreign = {
      ...connection,
      id: "foreign-connection",
      owner_user_id: "other-user",
      provider_subject: "subject-foreign",
      account_email: "other@example.com",
    };
    const inventory = filterGoogleConnectionInventoryForUser(
      {
        connections: [foreign, connection],
        resources: [
          {
            ...baseResource,
            id: "foreign-resource",
            connection_id: foreign.id,
            resource_type: "google_document" as const,
          },
          {
            ...baseResource,
            id: "owned-resource",
            connection_id: connection.id,
            resource_type: "google_document" as const,
          },
        ],
      },
      "reviewer",
      [],
    );

    expect(inventory.connections.map((row) => row.id)).toEqual([
      "owned-connection",
    ]);
    expect(inventory.resources.map((row) => row.id)).toEqual([
      "owned-resource",
    ]);
  });

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
      capability_health: null,
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

  // The list is DERIVED, not hand-typed: a `google_presentation` row — a type
  // the server has shipped, registers, and had already made a live `slides.read`
  // call against — used to throw HERE, and this reader maps EVERY resource row,
  // so one connected deck emptied every Google surface in the app (V13-3).
  it.each(GOOGLE_CONNECTION_RESOURCE_TYPES)(
    "accepts a %s row the server can register",
    (resourceType) => {
      expect(
        connectionResource({
          ...baseResource,
          resource_type: resourceType,
          resource_ref: "resource-1",
        }),
      ).toMatchObject({ resource_type: resourceType });
    },
  );

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
