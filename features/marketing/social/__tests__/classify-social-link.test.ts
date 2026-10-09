import { classifySocialLink } from "../link";

describe("classifySocialLink", () => {
  it("reads a TikTok video as a post", () => {
    expect(classifySocialLink("https://www.tiktok.com/@garyvee/video/7553265349393005830")).toMatchObject({
      kind: "post",
      platform: "tiktok",
    });
  });
  it("reads posts on every platform", () => {
    const posts: [string, string][] = [
      ["https://www.instagram.com/reel/DPabc123/", "instagram"],
      ["https://www.instagram.com/p/DPabc123/", "instagram"],
      ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
      ["https://youtu.be/dQw4w9WgXcQ", "youtube"],
      ["https://www.youtube.com/shorts/abc123", "youtube"],
      ["https://x.com/naval/status/1002103360646823936", "x"],
      ["https://twitter.com/naval/status/1002103360646823936", "x"],
      ["https://www.linkedin.com/posts/someone_topic-activity-123", "linkedin"],
      ["https://www.facebook.com/watch/?v=123", "facebook"],
    ];
    for (const [url, platform] of posts) {
      expect(classifySocialLink(url)).toMatchObject({ kind: "post", platform });
    }
  });
  it("reads an account link as a profile with its handle", () => {
    expect(classifySocialLink("https://www.tiktok.com/@mrbeast")).toMatchObject({ kind: "profile", platform: "tiktok", handle: "mrbeast" });
    expect(classifySocialLink("https://www.youtube.com/@AlexHormozi")).toMatchObject({ kind: "profile", platform: "youtube", handle: "AlexHormozi" });
    expect(classifySocialLink("https://www.instagram.com/garyvee/")).toMatchObject({ kind: "profile", platform: "instagram", handle: "garyvee" });
    expect(classifySocialLink("https://www.linkedin.com/in/someone")).toMatchObject({ kind: "profile", platform: "linkedin" });
  });
  it("leaves everything else to the web page tile", () => {
    for (const text of [
      "https://example.com/post/1",
      "https://www.tiktok.com/",
      "https://www.youtube.com/results?search_query=x",
      "https://www.linkedin.com/feed/",
      "@garyvee",
      "just some words",
    ]) {
      expect(classifySocialLink(text)).toBeNull();
    }
  });
});
