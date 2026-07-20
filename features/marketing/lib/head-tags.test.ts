import { parseSnapshotHeadTags } from "@/features/marketing/lib/head-tags";

describe("parseSnapshotHeadTags", () => {
  it("reads title and meta description from scraper head_tags", () => {
    const parsed = parseSnapshotHeadTags({
      title: " AI Matrx ",
      meta_description: " Enterprise AI platform ",
      og: {},
    });
    expect(parsed.title).toBe("AI Matrx");
    expect(parsed.metaDescription).toBe("Enterprise AI platform");
    expect(parsed.canonicalUrl).toBeNull();
    expect(parsed.og.image).toBeNull();
  });

  it("reads indexability and social fields", () => {
    const parsed = parseSnapshotHeadTags({
      title: "Page",
      canonical_url: "https://example.com/",
      meta_robots: "follow, index",
      lang: "en-US",
      og: {
        "og:title": "OG Page",
        "og:description": "Share copy",
        "og:image": "https://example.com/og.png",
        "og:site_name": "Example",
        "og:url": "https://example.com/",
        "og:type": "website",
      },
      twitter: {
        "twitter:card": "summary_large_image",
        "twitter:title": "Tweet Page",
      },
    });
    expect(parsed.canonicalUrl).toBe("https://example.com/");
    expect(parsed.metaRobots).toBe("follow, index");
    expect(parsed.lang).toBe("en-US");
    expect(parsed.og).toEqual({
      title: "OG Page",
      description: "Share copy",
      image: "https://example.com/og.png",
      siteName: "Example",
      url: "https://example.com/",
      type: "website",
    });
    expect(parsed.twitter.card).toBe("summary_large_image");
    expect(parsed.twitter.image).toBeNull();
  });

  it("returns nulls for missing or invalid payloads", () => {
    const empty = parseSnapshotHeadTags(null);
    expect(empty.title).toBeNull();
    expect(empty.metaDescription).toBeNull();
    expect(empty.og.title).toBeNull();
    expect(empty.twitter.card).toBeNull();
    expect(parseSnapshotHeadTags({ title: "   " }).title).toBeNull();
  });
});
