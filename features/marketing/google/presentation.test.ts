import {
  googleConnectionLabel,
  summarizeGoogleResourcesByConnection,
  uniqueGoogleResourcesByProviderIdentity,
} from "@/features/marketing/google/presentation";
import type { GoogleConnectionResource } from "@/features/marketing/google/types";

function resource(
  resource_type: GoogleConnectionResource["resource_type"],
): GoogleConnectionResource {
  return {
    id: resource_type,
    connection_id: "connection-1",
    resource_type,
    resource_ref: `${resource_type}-ref`,
    display_name: resource_type,
    permission_level: null,
    discovered_at: "2026-08-20T00:00:00Z",
    metadata: {},
  };
}

describe("Google connection presentation", () => {
  it("shows the email when two identities can share one display name", () => {
    expect(
      googleConnectionLabel({
        account_name: "Arman Sadeghi",
        account_email: "arman26@gmail.com",
      }),
    ).toBe("Arman Sadeghi · arman26@gmail.com");
  });

  it("does not count Picker-selected Workspace files as YouTube channels", () => {
    const summary = summarizeGoogleResourcesByConnection([
      resource("search_console_property"),
      resource("analytics_property"),
      resource("youtube_channel"),
      resource("google_document"),
      resource("google_spreadsheet"),
    ]).get("connection-1");

    expect(summary).toMatchObject({
      searchConsoleCount: 1,
      analyticsCount: 1,
    });
    expect(summary?.youtubeChannels).toHaveLength(1);
    expect(summary?.youtubeChannels[0].resource_type).toBe("youtube_channel");
  });

  it("presents the same provider channel once across duplicate connections", () => {
    const first = resource("youtube_channel");
    const duplicate = {
      ...first,
      id: "youtube-channel-duplicate",
      connection_id: "connection-2",
    };

    expect(
      uniqueGoogleResourcesByProviderIdentity([first, duplicate]),
    ).toEqual([first]);
  });
});
