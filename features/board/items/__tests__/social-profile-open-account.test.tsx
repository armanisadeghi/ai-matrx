/** @jest-environment jsdom */
// The account's name, picture and handle open its page like the "Open account" button (the tile was plain text).
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/features/marketing/social/components/SocialImage", () => ({ SocialImage: () => null }));
jest.mock("@/features/marketing/social/server", () => ({ postThumbnailDoor: () => null, profileAvatarDoor: () => null }));
jest.mock("@/features/marketing/social/components/OutlierBadge", () => ({ OutlierBadge: () => null }));
jest.mock("@/features/marketing/social/components/AdCard", () => ({ libraryLabel: () => "" }));
jest.mock("@/features/marketing/social/components/SocialPostCard", () => ({ thumbAspect: () => "aspect-[3/4]" }));

import { ProfileTileView } from "../social-tile-views";

const profile = {
  id: "p1",
  platform: "instagram",
  handle: "bluebottle",
  display_name: "Blue Bottle Coffee",
  avatar_file_id: null,
  avatar_url: null,
  is_verified: false,
  follower_count: 518000,
  following_count: 10,
  post_count: 100,
  total_likes: null,
  bio: null,
} as never;

function mount(onOpenAccount: (() => void) | null) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <ProfileTileView
        profile={profile}
        posts={[]}
        snapshots={[]}
        trackedRole={null}
        canTrack={false}
        tracking={false}
        onTrack={() => undefined}
        onOpenAccount={onOpenAccount}
        onOpenPost={() => undefined}
      />,
    );
  });
  return host;
}

describe("profile tile header", () => {
  it("opens the account from the name, the handle and the picture", () => {
    const open = jest.fn();
    const host = mount(open);
    const targets = [...host.querySelectorAll("button")].filter((b) => /^Open (Blue Bottle Coffee|@bluebottle)$/.test(b.getAttribute("aria-label") ?? ""));
    expect(targets).toHaveLength(3);
    for (const t of targets) act(() => t.click());
    expect(open).toHaveBeenCalledTimes(3);
  });
  it("is plain text when the account has no page", () => {
    const host = mount(null);
    expect(host.textContent).toContain("Blue Bottle Coffee");
    expect([...host.querySelectorAll("button")].some((b) => /^Open /.test(b.getAttribute("aria-label") ?? ""))).toBe(false);
  });
});
