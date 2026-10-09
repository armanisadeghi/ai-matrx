import { extractSocialLinks, socialProfileFromUrl } from "./social-links";

describe("socialProfileFromUrl", () => {
  it("keeps profile URLs and canonicalises them", () => {
    expect(socialProfileFromUrl("https://www.instagram.com/hubspot/?hl=en")).toEqual({
      platform: "instagram",
      url: "https://www.instagram.com/hubspot",
    });
    expect(socialProfileFromUrl("https://tiktok.com/@hubspot")?.platform).toBe("tiktok");
    expect(socialProfileFromUrl("https://twitter.com/hubspot")?.url).toBe("https://x.com/hubspot");
    expect(socialProfileFromUrl("https://www.linkedin.com/company/hubspot/")?.url).toBe(
      "https://www.linkedin.com/company/hubspot",
    );
    expect(socialProfileFromUrl("https://www.youtube.com/@hubspot")?.platform).toBe("youtube");
  });
  it("rejects share buttons, posts and logins", () => {
    for (const bad of [
      "https://www.facebook.com/sharer/sharer.php?u=x",
      "https://twitter.com/intent/tweet?text=x",
      "https://www.instagram.com/p/ABC123/",
      "https://www.tiktok.com/music/abc",
      "https://www.youtube.com/watch?v=abc",
      "https://example.com/hubspot",
      "not a url",
    ]) {
      expect(socialProfileFromUrl(bad)).toBeNull();
    }
  });
});

describe("extractSocialLinks", () => {
  it("finds links anywhere in a nested payload, one per platform", () => {
    const payload = {
      results: [{ links: ["https://www.instagram.com/acme", "https://www.instagram.com/other"], html: '<a href="https://tiktok.com/@acme">t</a>' }],
    };
    expect(extractSocialLinks(payload).map((l) => l.platform).sort()).toEqual(["instagram", "tiktok"]);
  });
});
