
import { detectPlatform, handleFromInput, looksLikePostUrl, normalizeHandle } from "../link";

describe("pasted links", () => {
  it("detects the platform from a URL", () => {
    expect(detectPlatform("https://www.tiktok.com/@mrbeast")).toBe("tiktok");
    expect(detectPlatform("instagram.com/oakstreet/")).toBe("instagram");
    expect(detectPlatform("https://youtu.be/abc123")).toBe("youtube");
    expect(detectPlatform("https://twitter.com/x")).toBe("x");
  });
  it("a bare handle names no platform", () => {
    expect(detectPlatform("@mrbeast")).toBeNull();
    expect(detectPlatform("mrbeast")).toBeNull();
  });
  it("tells a post link from a profile", () => {
    expect(looksLikePostUrl("https://www.tiktok.com/@mrbeast/video/7123456789")).toBe(true);
    expect(looksLikePostUrl("https://www.instagram.com/reel/Cxyz/")).toBe(true);
    expect(looksLikePostUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(looksLikePostUrl("https://youtu.be/abc")).toBe(true);
    expect(looksLikePostUrl("https://www.tiktok.com/@mrbeast")).toBe(false);
    expect(looksLikePostUrl("@mrbeast")).toBe(false);
  });
  it("extracts a handle", () => {
    expect(handleFromInput("https://www.tiktok.com/@mrbeast")).toBe("mrbeast");
    expect(handleFromInput("@MrBeast")).toBe("MrBeast");
    expect(handleFromInput("https://instagram.com/oakstreet/")).toBe("oakstreet");
  });
});

describe("normalizeHandle (the one handle normalizer)", () => {
  it.each([
    ["https://www.instagram.com/allgreen_itad/?hl=en", "allgreen_itad"],
    ["instagram.com/allgreen_itad/", "allgreen_itad"],
    ["https://www.tiktok.com/@allgreen", "allgreen"],
    ["https://www.reddit.com/user/allgreen/", "allgreen"],
    ["https://www.snapchat.com/add/allgreen", "allgreen"],
    ["https://www.linkedin.com/company/allgreen-recycling/", "allgreen-recycling"],
    ["@allgreen", "allgreen"],
    ["  allgreen  ", "allgreen"],
    ["", ""],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeHandle(input)).toBe(expected);
  });
  it("tolerates null", () => {
    expect(normalizeHandle(null)).toBe("");
  });
});

import { parseSocialAccount, profileUrlFor } from "../link";

describe("parseSocialAccount (the one account-input parser)", () => {
  const ok = (input: string, fallback: Parameters<typeof parseSocialAccount>[1], platform: string, handle: string, url?: string) => {
    const r = parseSocialAccount(input, fallback);
    expect(r).toMatchObject({ status: "ok", platform, handle });
    if (url) expect(r.status === "ok" && r.url).toBe(url);
  };

  it.each([
    "https://www.tiktok.com/@vasarostyle",
    "https://tiktok.com/@vasarostyle",
    "tiktok.com/@vasarostyle",
    "www.tiktok.com/@vasarostyle/",
    "https://m.tiktok.com/@vasarostyle?lang=en",
    "@vasarostyle",
    "vasarostyle",
    "  @vasarostyle  ",
  ])("TikTok: %s", (input) => {
    ok(input, "tiktok", "tiktok", "vasarostyle", "https://www.tiktok.com/@vasarostyle");
  });

  it("a bare handle with no platform asks for one", () => {
    expect(parseSocialAccount("vasarostyle")).toEqual({ status: "needs_platform", handle: "vasarostyle" });
    expect(parseSocialAccount("@vasarostyle")).toEqual({ status: "needs_platform", handle: "vasarostyle" });
  });

  it("a pasted address wins over the fallback platform", () => {
    ok("tiktok.com/@vasarostyle", "instagram", "tiktok", "vasarostyle");
    expect(parseSocialAccount("tiktok.com/@vasarostyle", "instagram")).toMatchObject({ detected: true });
    expect(parseSocialAccount("vasarostyle", "instagram")).toMatchObject({ detected: false });
  });

  it.each([
    ["youtube.com/@vasarostyle", "youtube", "vasarostyle", "https://www.youtube.com/@vasarostyle"],
    ["https://www.youtube.com/@vasarostyle/videos", "youtube", "vasarostyle", "https://www.youtube.com/@vasarostyle"],
    ["https://www.youtube.com/c/armansadeghi", "youtube", "armansadeghi", "https://www.youtube.com/c/armansadeghi"],
    ["https://www.youtube.com/c/armansadeghi/videos", "youtube", "armansadeghi", "https://www.youtube.com/c/armansadeghi"],
    ["https://www.youtube.com/user/armansadeghi", "youtube", "armansadeghi", "https://www.youtube.com/user/armansadeghi"],
    ["https://www.youtube.com/channel/UCF4Ku_RBslqV3A36j6KddZQ?view_as=subscriber", "youtube", "UCF4Ku_RBslqV3A36j6KddZQ", "https://www.youtube.com/channel/UCF4Ku_RBslqV3A36j6KddZQ"],
    ["https://www.linkedin.com/in/arman-sadeghi-8b176627/", "linkedin", "arman-sadeghi-8b176627", "https://www.linkedin.com/in/arman-sadeghi-8b176627"],
    ["linkedin.com/company/titanium-marketing", "linkedin", "titanium-marketing", "https://www.linkedin.com/company/titanium-marketing"],
    ["https://x.com/vasarostyle", "x", "vasarostyle", "https://x.com/vasarostyle"],
    ["twitter.com/vasarostyle", "x", "vasarostyle", "https://x.com/vasarostyle"],
    ["https://mobile.twitter.com/@vasarostyle?s=20", "x", "vasarostyle", "https://x.com/vasarostyle"],
    ["https://twitter.com/https://twitter.com/titaniumsuccess", "x", "titaniumsuccess", "https://x.com/titaniumsuccess"],
    ["instagram.com/vasarostyle/?hl=en", "instagram", "vasarostyle", "https://www.instagram.com/vasarostyle"],
    ["https://www.instagram.com/vasarostyle/", "instagram", "vasarostyle", "https://www.instagram.com/vasarostyle"],
    ["https://facebook.com/vasarostyle", "facebook", "vasarostyle", "https://www.facebook.com/vasarostyle"],
    ["fb.com/vasarostyle/", "facebook", "vasarostyle", "https://www.facebook.com/vasarostyle"],
    ["https://pinterest.com/vasarostyle", "pinterest", "vasarostyle", "https://www.pinterest.com/vasarostyle"],
    ["https://www.pinterest.co.uk/vasarostyle/", "pinterest", "vasarostyle", "https://www.pinterest.com/vasarostyle"],
    ["https://threads.net/@vasarostyle", "threads", "vasarostyle", "https://www.threads.com/@vasarostyle"],
    ["https://www.threads.com/@vasarostyle", "threads", "vasarostyle", "https://www.threads.com/@vasarostyle"],
    ["https://www.snapchat.com/add/vasarostyle", "snapchat", "vasarostyle", "https://www.snapchat.com/add/vasarostyle"],
    ["https://www.reddit.com/user/vasarostyle", "reddit", "vasarostyle", "https://www.reddit.com/user/vasarostyle"],
    ["reddit.com/u/vasarostyle/", "reddit", "vasarostyle", "https://www.reddit.com/user/vasarostyle"],
    ["https://www.reddit.com/r/ewaste/", "reddit", "r/ewaste", "https://www.reddit.com/r/ewaste"],
  ])("%s", (input, platform, handle, url) => {
    ok(input, null, platform, handle, url);
  });

  it("bare Reddit forms name Reddit by themselves", () => {
    ok("r/ewaste", null, "reddit", "r/ewaste");
    ok("/u/spez", null, "reddit", "spez");
    expect(parseSocialAccount("u/spez", null)).toMatchObject({ label: "u/spez" });
  });

  it("labels", () => {
    expect(parseSocialAccount("https://x.com/a", null)).toMatchObject({ label: "@a" });
    expect(parseSocialAccount("r/ewaste", null)).toMatchObject({ label: "r/ewaste" });
  });

  it("a bare LinkedIn handle becomes a company page", () => {
    ok("titanium-marketing", "linkedin", "linkedin", "titanium-marketing", "https://www.linkedin.com/company/titanium-marketing");
  });

  it("post links are not accounts", () => {
    expect(parseSocialAccount("https://www.tiktok.com/@a/video/7300000000000000000")).toMatchObject({ status: "post", platform: "tiktok" });
    expect(parseSocialAccount("https://youtu.be/abc")).toMatchObject({ status: "post" });
  });

  it("non-accounts are invalid, never a guess", () => {
    for (const bad of ["https://www.datadestruction.com/about", "https://www.instagram.com/", "tiktok.com", "two words", "https://www.linkedin.com/feed/"]) {
      expect(parseSocialAccount(bad, "tiktok")).toEqual({ status: "invalid" });
    }
    expect(parseSocialAccount("   ")).toEqual({ status: "empty" });
    expect(parseSocialAccount(null)).toEqual({ status: "empty" });
  });

  it("profileUrlFor builds the same address parse reports", () => {
    expect(profileUrlFor("tiktok", "@a")).toBe("https://www.tiktok.com/@a");
    expect(profileUrlFor("linkedin", "a")).toBe("https://www.linkedin.com/in/a");
  });
});
