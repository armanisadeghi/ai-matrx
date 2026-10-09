import { capturePollInterval, capturedPostsMissingFrom, enrichWithCaptures, knownPostKeys, parseBrowserCapture } from "../browserCaptures";
import { instagramIdToShortcode, instagramShortcodeToId, samePost } from "../postMatch";

const social = {
  schema: "social_capture.v1",
  status: "parsed",
  profile: { display_name: "La Jolla Kayak", follower_count: 7801, post_count: 523 },
  posts: [
    { platform_post_id: "Cseuqn0AFkd", url: "https://www.instagram.com/reel/Cseuqn0AFkd/", format: "reel", text: "Video by La Jolla Kayak" },
    { platform_post_id: "Das6jaZmsJl", url: "https://www.instagram.com/p/Das6jaZmsJl/", format: "image" },
  ],
  notes: [],
};

describe("browser captures", () => {
  it("parses the stored social block and refuses an unknown schema", () => {
    const c = parseBrowserCapture("doc-1", "2026-10-09T21:00:00Z", social);
    expect(c?.profile.followerCount).toBe(7801);
    expect(c?.posts.map((p) => p.platformPostId)).toEqual(["Cseuqn0AFkd", "Das6jaZmsJl"]);
    expect(parseBrowserCapture("doc-1", "x", { ...social, schema: "other" })).toBeNull();
  });

  it("merges only posts the shared cache does not already have (by id or url segment)", () => {
    const c = parseBrowserCapture("doc-1", "x", social)!;
    expect(capturedPostsMissingFrom([c], new Set(["Das6jaZmsJl"])).map((p) => p.platformPostId)).toEqual(["Cseuqn0AFkd"]);
    expect(capturedPostsMissingFrom([c, c], new Set()).length).toBe(2);
  });
});

describe("post matching (numeric media id vs shortcode)", () => {
  it("is the same base-64 id both ways, on live @lajollakayak pairs", () => {
    expect(instagramShortcodeToId("DbBetyXguAG")).toBe("3945569836406595590");
    expect(instagramIdToShortcode("3107126032038123805")).toBe("Cseuqn0AFkd");
    expect(samePost("instagram", { platformPostId: "DdC6aVWj8_n" }, { platformPostId: "3982001916880080871" })).toBe(true);
    expect(samePost("instagram", { platformPostId: "DdC6aVWj8_n" }, { platformPostId: "3107126032038123805" })).toBe(false);
  });

  it("hides a captured post whose shared twin is keyed by numeric id, and fills only the missing numbers", () => {
    const c = parseBrowserCapture("doc-1", "x", { ...social, posts: [{ ...social.posts[0], likes: 40, views: 900 }] })!;
    const shared = [{ platform: "instagram", url: "https://www.instagram.com/reel/Cseuqn0AFkd/", views: 1200, likes: null, comments: null, shares: null }];
    expect(capturedPostsMissingFrom([c], knownPostKeys("instagram", shared), "instagram")).toEqual([]);
    const [merged] = enrichWithCaptures(shared, [c], "instagram");
    expect(merged.views).toBe(1200);
    expect(merged.likes).toBe(40);
  });
});

describe("images landing after the capture", () => {
  it("polls only while the newest capture's images are pending and fresh", () => {
    const pending = parseBrowserCapture("d", "2026-10-09T21:00:00Z", { ...social, images_pending: true })!;
    const t = new Date("2026-10-09T21:00:30Z").getTime();
    expect(capturePollInterval([pending], t)).toBe(4000);
    expect(capturePollInterval([pending], t + 300_000)).toBe(false);
    expect(capturePollInterval([parseBrowserCapture("d", "2026-10-09T21:00:00Z", social)!], t)).toBe(false);
  });
});
