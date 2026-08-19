import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShareControl } from "./ShareControl";

jest.mock("@/features/sharing/components/ShareButton", () => ({
  ShareButton: ({ resourceId }: { resourceId: string }) => (
    <span data-testid="share-button">{resourceId}</span>
  ),
}));

describe("ShareControl", () => {
  it("does not send a fixture profile id into persisted sharing operations", () => {
    const markup = renderToStaticMarkup(
      <ShareControl
        profileId="bp_personal_default"
        profileName="My Cloud Browser"
        canShare
      />,
    );

    expect(markup).not.toContain('data-testid="share-button"');
    expect(markup).toContain(
      "Sharing becomes available when this Cloud Browser is saved.",
    );
  });

  it("mounts canonical sharing for a persisted browser profile", () => {
    const profileId = "506a20fc-34a9-4038-b38b-6c71ab09b173";
    const markup = renderToStaticMarkup(
      <ShareControl
        profileId={profileId}
        profileName="My Cloud Browser"
        canShare
      />,
    );

    expect(markup).toContain('data-testid="share-button"');
    expect(markup).toContain(profileId);
  });
});
