import { capturedPostsMissingFrom, parseBrowserCapture } from "../capturedFromBrowser";

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
