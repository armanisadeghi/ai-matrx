import { canonicalPostUrl } from "../link";
import { postAddress, toPostCardModel } from "../mappers";
import { describeSocialFailure } from "../failure";
import { postPanelOutOfScope, brandSegOfPath } from "../panelScope";
import { accountTileSeeds, starterAccountSeeds } from "../board-accounts";
import { withAccountTiles } from "../studio/studio-starter";
import { SocialStreamError } from "../stream";

const ID = "7137423965982592302";

describe("a post's address comes from the stored post and its real author, never the pasted handle", () => {
  it("rebuilds a TikTok address whose handle is not the author's", () => {
    expect(
      canonicalPostUrl({ platform: "tiktok", platformPostId: ID, handle: "charlidamelio", url: `https://www.tiktok.com/@khaby.lame/video/${ID}` }),
    ).toBe(`https://www.tiktok.com/@charlidamelio/video/${ID}`);
  });
  it("keeps an address that already names the author (case aside)", () => {
    const url = `https://www.tiktok.com/@CharliDamelio/video/${ID}?lang=en`;
    expect(canonicalPostUrl({ platform: "tiktok", platformPostId: ID, handle: "charlidamelio", url })).toBe(url);
  });
  it("builds one when none is stored, for the platforms whose address is handle + id", () => {
    expect(canonicalPostUrl({ platform: "tiktok", platformPostId: ID, handle: "@mrbeast", url: null })).toBe(`https://www.tiktok.com/@mrbeast/video/${ID}`);
    expect(canonicalPostUrl({ platform: "x", platformPostId: "55", handle: "nasa", url: "" })).toBe("https://x.com/nasa/status/55");
  });
  it("rebuilds an X address with the wrong account", () => {
    expect(canonicalPostUrl({ platform: "x", platformPostId: "55", handle: "nasa", url: "https://x.com/other/status/55" })).toBe("https://x.com/nasa/status/55");
  });
  it("leaves every other platform's stored address alone", () => {
    const url = "https://www.instagram.com/reel/Cxyz/";
    expect(canonicalPostUrl({ platform: "instagram", platformPostId: "Cxyz", handle: "someone", url })).toBe(url);
    expect(canonicalPostUrl({ platform: "linkedin", platformPostId: "1", handle: null, url: "https://www.linkedin.com/posts/a-1" })).toBe("https://www.linkedin.com/posts/a-1");
  });
  it("the card model, the kind and the tile all read it through postAddress", () => {
    const post = { platform: "tiktok", platform_post_id: ID, url: `https://www.tiktok.com/@khaby.lame/video/${ID}` };
    expect(postAddress(post, "charlidamelio")).toBe(`https://www.tiktok.com/@charlidamelio/video/${ID}`);
    const card = toPostCardModel({
      post: { ...post, id: "p1", profile_id: null, format: "video", caption: "", title: null, posted_at: null, thumbnail_url: null, duration_seconds: null, is_ad: false, status: "live" } as never,
      stat: null,
      handle: "charlidamelio",
    });
    expect(card.url).toBe(`https://www.tiktok.com/@charlidamelio/video/${ID}`);
  });
});

describe("a refused read is described in a person's words", () => {
  const refusal = (code: string, user: string) => new SocialStreamError(code, user);
  it("never shows a vendor, a cache key or a code", () => {
    const busy = describeSocialFailure(refusal("social_provider_failed", "linkedin profile @arman came back without a platform user id; the shared cache is keyed by that id"));
    const blocked = describeSocialFailure(refusal("social_not_found", "get_profile: /v1/linkedin/profile: not found or private (Profile is restricted)"));
    for (const f of [busy, blocked]) {
      expect(`${f.title} ${f.reason}`).not.toMatch(/provider|cache|platform user id|Profile is restricted|\/v1\/|social_/i);
    }
    expect(busy).toMatchObject({ kind: "busy", canRetry: true, canCapture: true });
    expect(blocked).toMatchObject({ kind: "restricted", canRetry: false, canCapture: true });
  });
});

describe("a post panel belongs to its brand's pages", () => {
  it("reads the brand segment off a path", () => {
    expect(brandSegOfPath("/marketing/mel-robbins/socials/studio")).toBe("mel-robbins");
    expect(brandSegOfPath("/board")).toBeNull();
  });
  it("closes on another brand, on /board, and anywhere outside marketing", () => {
    expect(postPanelOutOfScope({ brandSeg: "mel-robbins", pathname: "/marketing/data-destruction/socials/studio" })).toBe(true);
    expect(postPanelOutOfScope({ brandSeg: "mel-robbins", pathname: "/board" })).toBe(true);
    expect(postPanelOutOfScope({ brandSeg: "mel-robbins", pathname: "/marketing" })).toBe(true);
  });
  it("stays on its own brand's pages, whatever the tab or case", () => {
    expect(postPanelOutOfScope({ brandSeg: "mel-robbins", pathname: "/marketing/mel-robbins/socials/outliers" })).toBe(false);
    expect(postPanelOutOfScope({ brandSeg: "Mel-Robbins", pathname: "/marketing/mel-robbins/analytics" })).toBe(false);
  });
  it("a panel opened outside any brand follows the person", () => {
    expect(postPanelOutOfScope({ brandSeg: "", pathname: "/board" })).toBe(false);
    expect(postPanelOutOfScope({ brandSeg: undefined, pathname: "/marketing/x" })).toBe(false);
  });
});

describe("a brand's accounts become profile tiles", () => {
  const row = (o: Record<string, unknown>) => ({ rowId: "r", platform: "tiktok", handle: "h", role: "competitor", followers: 1, profileId: "p", profileUrl: null, ...o }) as never;
  const rows = [
    row({ rowId: "a", handle: "rival", role: "competitor", followers: 900, profileId: "pa" }),
    row({ rowId: "b", handle: "mel", role: "own", followers: 10, profileId: "pb" }),
    row({ rowId: "c", handle: "mel_ig", role: "own", platform: "instagram", profileId: null, profileUrl: "https://instagram.com/mel_ig" }),
  ];
  it("puts the brand's own accounts first", () => {
    expect(accountTileSeeds(rows).map((s) => s.title)).toEqual(["@mel", "@mel_ig", "@rival"]);
  });
  it("starts a fresh Studio with the own accounts already stored, never one that would need a paid read", () => {
    expect(starterAccountSeeds(rows).map((s) => s.title)).toEqual(["@mel"]);
  });
  it("adds them below the template in a labelled frame, and adds nothing for a brand with none", () => {
    const base = { camera: { x: 0, y: 0, z: 1 }, nodes: [], groups: [], edges: [], shapes: [] };
    expect(withAccountTiles(base, [])).toBe(base);
    const doc = withAccountTiles(base, starterAccountSeeds(rows));
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0].source).toMatchObject({ kind: "entity", entity: "social-profile", id: "pb" });
    expect(doc.groups[0].title).toBe("Your accounts");
  });
});
