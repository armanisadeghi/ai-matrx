import {
  buildSiteVideoAssets,
  type SiteVideoResourceRow,
} from "@/features/marketing/lib/snapshot-video";
import type { ParsedSnapshotResource } from "@/features/marketing/lib/snapshot-content";

function resource(
  overrides: Partial<ParsedSnapshotResource> & { url: string },
): ParsedSnapshotResource {
  return {
    kind: "video",
    tag: "iframe",
    sourceAttribute: null,
    rel: null,
    mimeType: null,
    attributes: {},
    ...overrides,
  };
}

function row(
  pageId: string,
  path: string,
  resources: ParsedSnapshotResource[],
): SiteVideoResourceRow {
  return {
    pageId,
    url: `https://example.com${path}`,
    path,
    capturedAt: "2026-08-01T00:00:00Z",
    resources,
  };
}

describe("buildSiteVideoAssets", () => {
  it("dedupes the same YouTube video across URL forms and pages", () => {
    const assets = buildSiteVideoAssets([
      row("p1", "/a", [
        resource({ url: "https://www.youtube.com/embed/dQw4w9WgXcQ" }),
      ]),
      row("p2", "/b", [
        resource({ url: "https://youtu.be/dQw4w9WgXcQ", kind: "embed" }),
      ]),
    ]);
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      key: "youtube:dQw4w9WgXcQ",
      provider: "youtube",
      videoId: "dQw4w9WgXcQ",
    });
    expect(assets[0].posterUrl).toContain("dQw4w9WgXcQ");
    expect(assets[0].pages.map((page) => page.pageId)).toEqual(["p1", "p2"]);
  });

  it("classifies direct files and Vimeo, and excludes tracking iframes and audio", () => {
    const assets = buildSiteVideoAssets([
      row("p1", "/a", [
        resource({ url: "https://cdn.example.com/promo.m4v", tag: "video" }),
        resource({ url: "https://vimeo.com/123456789" }),
        resource({
          url: "https://www.googletagmanager.com/ns.html?id=GTM-XXXX",
        }),
        resource({
          url: "https://www.google.com/recaptcha/api2/anchor?k=abc",
          kind: "embed",
        }),
        // Structured-data poster image recorded under kind="video".
        resource({
          url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg",
          tag: "structured-data",
        }),
        resource({ url: "https://example.com/song.mp3", kind: "audio" }),
        resource({ url: "https://example.com/logo.png", kind: "image" }),
      ]),
    ]);
    expect(assets.map((asset) => asset.provider)).toEqual(["vimeo", "file"]);
    expect(assets.find((asset) => asset.provider === "vimeo")).toMatchObject({
      key: "vimeo:123456789",
      videoId: "123456789",
    });
  });

  it("orders providers first and most-referenced first within a group", () => {
    const assets = buildSiteVideoAssets([
      row("p1", "/a", [
        resource({ url: "https://widgets.example.net/frame", kind: "iframe" }),
        resource({ url: "https://www.youtube.com/watch?v=abcdefghijk" }),
      ]),
      row("p2", "/b", [
        resource({ url: "https://widgets.example.net/frame", kind: "iframe" }),
      ]),
    ]);
    expect(assets.map((asset) => asset.provider)).toEqual([
      "youtube",
      "embed",
    ]);
    expect(assets[1].pages).toHaveLength(2);
  });
});
