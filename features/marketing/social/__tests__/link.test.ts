
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
