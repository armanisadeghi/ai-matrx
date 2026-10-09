import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import { postTabOpenInput, readPostTabData, SOCIAL_POST_KIND } from "../canvas/postKind";
import { guessAspect, isVideoPost } from "../components/PostMedia";

describe("a post is a canvas tab keyed by the post", () => {
  it("opens one tab per post and reads it back", () => {
    const input = postTabOpenInput({ postId: "p1", organizationId: "o1", brandSeg: "brand", title: " Hook " });
    expect(input.kind).toBe(SOCIAL_POST_KIND);
    expect(input.key).toBe("p1");
    expect(readPostTabData(input.data)).toEqual({ postId: "p1", organizationId: "o1", brandSeg: "brand", title: "Hook", tab: "overview" });
  });
  it("refuses data with no post or no organization", () => {
    expect(readPostTabData({ postId: "p1" })).toBeNull();
    expect(readPostTabData(null)).toBeNull();
  });
});

describe("the player's shape", () => {
  it("is portrait for shorts and reels, landscape for a regular YouTube video", () => {
    expect(guessAspect("reel", "instagram")).toBeLessThan(1);
    expect(guessAspect("video", "youtube")).toBeGreaterThan(1);
    expect(guessAspect("short", "youtube")).toBeLessThan(1);
  });
  it("asks for a video only on video posts", () => {
    expect(isVideoPost("video", "tiktok")).toBe(true);
    expect(isVideoPost("image", "instagram")).toBe(false);
  });
});

describe("no blocking drawer in the Socials section", () => {
  it("imports no Drawer anywhere under features/marketing/social", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? (e.name === "__tests__" ? [] : walk(join(dir, e.name))) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
      );
    const offenders = walk(join(__dirname, "..")).filter((f) => /components\/ui\/drawer/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
