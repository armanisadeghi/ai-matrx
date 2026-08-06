import { connectionResource } from "@/features/marketing/google/service";
import { GOOGLE_CONNECTION_SCOPES } from "@/features/marketing/google/types";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";

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
});
