import { classifyRedditHandle, classifyRedditUrl } from "./reddit-links";
import { describeDiscoveredSocialProfile } from "./discovery-promotion";
import { propertyPublicUrl } from "../components/shared/PropertyKindMark";

describe("classifyRedditUrl", () => {
  it("reads a subreddit as a subreddit", () => {
    expect(classifyRedditUrl("https://www.reddit.com/r/ewaste/")).toMatchObject({
      type: "subreddit",
      label: "r/ewaste",
      url: "https://www.reddit.com/r/ewaste",
    });
    expect(classifyRedditUrl("https://old.reddit.com/r/ewaste/top")?.type).toBe("subreddit");
  });
  it("reads /u/ and /user/ as a user", () => {
    expect(classifyRedditUrl("https://reddit.com/u/spez")).toMatchObject({ type: "user", label: "u/spez" });
    expect(classifyRedditUrl("https://www.reddit.com/user/spez/")).toMatchObject({
      type: "user",
      url: "https://www.reddit.com/user/spez",
    });
  });
  it("rejects the front page and other hosts", () => {
    expect(classifyRedditUrl("https://www.reddit.com/")).toBeNull();
    expect(classifyRedditUrl("https://www.reddit.com/best")).toBeNull();
    expect(classifyRedditUrl("https://example.com/r/ewaste")).toBeNull();
    expect(classifyRedditUrl("nope")).toBeNull();
  });
});

describe("classifyRedditHandle", () => {
  it("tells r/x from u/x", () => {
    expect(classifyRedditHandle("r/ewaste")?.type).toBe("subreddit");
    expect(classifyRedditHandle("/r/ewaste")?.label).toBe("r/ewaste");
    expect(classifyRedditHandle("u/spez")?.type).toBe("user");
    expect(classifyRedditHandle("/user/spez")?.type).toBe("user");
    expect(classifyRedditHandle("@spez")?.label).toBe("u/spez");
    expect(classifyRedditHandle("")).toBeNull();
  });
});

describe("Reddit through the property surfaces", () => {
  it("shows r/ewaste as a subreddit when a link is reviewed", () => {
    expect(
      describeDiscoveredSocialProfile({ guessed_kind: "social_profile", url: "https://www.reddit.com/r/ewaste/" }),
    ).toMatchObject({ kind: "reddit", identity: "r/ewaste", profileType: "Subreddit" });
    expect(
      describeDiscoveredSocialProfile({ guessed_kind: "social_profile", url: "https://www.reddit.com/user/spez" }),
    ).toMatchObject({ kind: "reddit", identity: "u/spez", profileType: "User profile" });
  });
  it("builds the right public URL from a handle", () => {
    expect(propertyPublicUrl({ kind: "reddit", url: null, handle: "r/ewaste" })).toBe("https://www.reddit.com/r/ewaste");
    expect(propertyPublicUrl({ kind: "reddit", url: null, handle: "u/spez" })).toBe("https://www.reddit.com/user/spez");
  });
});
