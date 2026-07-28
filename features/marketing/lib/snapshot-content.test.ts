import {
  parseSnapshotExtracted,
  parseSnapshotHeadings,
  parseSnapshotImages,
  parseSnapshotLinksSummary,
  parseSnapshotPageIdentity,
  parseSnapshotPerformance,
  parseSnapshotResources,
  parseSnapshotStructuredData,
} from "@/features/marketing/lib/snapshot-content";

describe("parseSnapshotHeadings", () => {
  it("keeps the document-ordered outline and the scraper h1 count", () => {
    const parsed = parseSnapshotHeadings({
      h1: ["Hero"],
      all: [
        { text: "Hero", level: 1 },
        { text: "Section", level: 2 },
        { text: "", level: 3 },
        { text: "Bad level", level: 9 },
        "not-an-object",
      ],
      h1_count: 1,
    });
    expect(parsed.all).toEqual([
      { text: "Hero", level: 1 },
      { text: "Section", level: 2 },
    ]);
    expect(parsed.h1Count).toBe(1);
  });

  it("derives h1 count from the outline when the scraper omitted it", () => {
    const parsed = parseSnapshotHeadings({
      all: [
        { text: "One", level: 1 },
        { text: "Two", level: 1 },
      ],
    });
    expect(parsed.h1Count).toBe(2);
  });

  it("returns an empty outline for invalid payloads", () => {
    expect(parseSnapshotHeadings(null)).toEqual({ all: [], h1Count: 0 });
  });
});

describe("parseSnapshotLinksSummary", () => {
  it("reads totals", () => {
    expect(
      parseSnapshotLinksSummary({ total: 150, internal: 144, external: 6 }),
    ).toEqual({ total: 150, internal: 144, external: 6 });
  });

  it("nulls missing fields", () => {
    expect(parseSnapshotLinksSummary(null)).toEqual({
      total: null,
      internal: null,
      external: null,
    });
  });
});

describe("parseSnapshotExtracted", () => {
  it("reads readability stats and the redirect chain", () => {
    const parsed = parseSnapshotExtracted({
      sentence_count: 149,
      flesch_reading_ease: 42.5,
      redirect_chain: [
        { url: "http://example.com/", status: 301 },
        { url: "https://example.com/", status: 200 },
        { status: 200 },
      ],
      mixed_content: ["http://example.com/script.js"],
    });
    expect(parsed.sentenceCount).toBe(149);
    expect(parsed.fleschReadingEase).toBe(42.5);
    expect(parsed.redirectChain).toEqual([
      { url: "http://example.com/", status: 301 },
      { url: "https://example.com/", status: 200 },
    ]);
    expect(parsed.mixedContentCount).toBe(1);
  });

  it("returns empty evidence for invalid payloads", () => {
    expect(parseSnapshotExtracted(null)).toEqual({
      sentenceCount: null,
      fleschReadingEase: null,
      redirectChain: [],
      mixedContentCount: 0,
    });
  });
});

describe("parseSnapshotStructuredData", () => {
  it("reads schema types and payload presence", () => {
    expect(
      parseSnapshotStructuredData({
        schema_types: ["Organization", "WebSite", 4],
        schema_org: { "@type": "Organization" },
      }),
    ).toEqual({
      schemaTypes: ["Organization", "WebSite"],
      hasPayload: true,
      blocks: [],
      jsonLd: [{ "@type": "Organization" }],
      jsonLdRaw: [],
      microdata: [],
      rdfa: [],
      microformats: [],
      parseErrors: [],
      blocksTruncated: false,
    });
    expect(parseSnapshotStructuredData(null)).toEqual({
      schemaTypes: [],
      hasPayload: false,
      blocks: [],
      jsonLd: [],
      jsonLdRaw: [],
      microdata: [],
      rdfa: [],
      microformats: [],
      parseErrors: [],
      blocksTruncated: false,
    });
  });
});

describe("parseSnapshotResources", () => {
  it("reads grouped resource inventory evidence", () => {
    expect(
      parseSnapshotResources({
        resources: {
          count: 2,
          counts: { image: 1, video: 1 },
          items: [
            { kind: "image", url: "/hero.jpg", tag: "img" },
            {
              kind: "video",
              url: "https://youtube.com/embed/a",
              tag: "iframe",
              attributes: { provider: "youtube" },
            },
          ],
          truncated: false,
        },
      }),
    ).toMatchObject({
      count: 2,
      counts: { image: 1, video: 1 },
      truncated: false,
      items: [
        { kind: "image", url: "/hero.jpg", tag: "img" },
        {
          kind: "video",
          url: "https://youtube.com/embed/a",
          tag: "iframe",
        },
      ],
    });
  });
});

describe("parseSnapshotPageIdentity", () => {
  it("prefers persisted identity and backfills old primary images", () => {
    expect(
      parseSnapshotPageIdentity(
        { page_identity: { cms: "wordpress", featured_image: "/hero.jpg" } },
        {},
      ),
    ).toMatchObject({ cms: "wordpress", featuredImage: "/hero.jpg" });
    expect(
      parseSnapshotPageIdentity(
        {},
        {
          schema_org: {
            "@graph": [
              {
                "@type": "WebPage",
                primaryImageOfPage: { url: "https://example.com/primary.jpg" },
              },
            ],
          },
        },
      ).featuredImage,
    ).toBe("https://example.com/primary.jpg");
  });
});

describe("parseSnapshotPerformance", () => {
  it("reads finite timing and transfer values", () => {
    expect(
      parseSnapshotPerformance({ response_time_ms: 241, bytes: 4096 }),
    ).toEqual({ responseTimeMs: 241, bytes: 4096 });
    expect(parseSnapshotPerformance(null)).toEqual({
      responseTimeMs: null,
      bytes: null,
    });
  });
});

describe("parseSnapshotImages", () => {
  it("reads image counts", () => {
    expect(parseSnapshotImages({ count: 23, missing_alt: 2 })).toEqual({
      count: 23,
      missingAlt: 2,
      items: [],
    });
    expect(parseSnapshotImages(null)).toEqual({
      count: null,
      missingAlt: null,
      items: [],
    });
  });

  it("reads the optional per-image inventory (items or images)", () => {
    const parsed = parseSnapshotImages({
      count: 2,
      missing_alt: 1,
      items: [
        {
          src: "/hero.webp",
          srcset: ["/hero-small.webp", "/hero.webp"],
          sizes: "100vw",
          alt: "Hero",
          width: 1200,
          height: 630,
          loading: "lazy",
          decoding: "async",
          fetchpriority: "high",
          title: "Hero image",
          featured: true,
        },
        { src: "/logo.svg" },
        "not-a-record",
      ],
    });
    expect(parsed.count).toBe(2);
    expect(parsed.items).toEqual([
      {
        src: "/hero.webp",
        srcset: ["/hero-small.webp", "/hero.webp"],
        sizes: "100vw",
        alt: "Hero",
        width: 1200,
        height: 630,
        loading: "lazy",
        decoding: "async",
        fetchPriority: "high",
        title: "Hero image",
        featured: true,
      },
      {
        src: "/logo.svg",
        srcset: [],
        sizes: null,
        alt: null,
        width: null,
        height: null,
        loading: null,
        decoding: null,
        fetchPriority: null,
        title: null,
        featured: false,
      },
    ]);
    expect(
      parseSnapshotImages({ count: 1, images: [{ src: "/a.png", alt: "" }] })
        .items,
    ).toEqual([
      {
        src: "/a.png",
        srcset: [],
        sizes: null,
        alt: "",
        width: null,
        height: null,
        loading: null,
        decoding: null,
        fetchPriority: null,
        title: null,
        featured: false,
      },
    ]);
  });
});
