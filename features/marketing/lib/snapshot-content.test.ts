import {
  parseSnapshotExtracted,
  parseSnapshotHeadings,
  parseSnapshotImages,
  parseSnapshotLinksSummary,
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
    });
    expect(parsed.sentenceCount).toBe(149);
    expect(parsed.fleschReadingEase).toBe(42.5);
    expect(parsed.redirectChain).toEqual([
      { url: "http://example.com/", status: 301 },
      { url: "https://example.com/", status: 200 },
    ]);
  });

  it("returns empty evidence for invalid payloads", () => {
    expect(parseSnapshotExtracted(null)).toEqual({
      sentenceCount: null,
      fleschReadingEase: null,
      redirectChain: [],
    });
  });
});

describe("parseSnapshotImages", () => {
  it("reads image counts", () => {
    expect(parseSnapshotImages({ count: 23, missing_alt: 2 })).toEqual({
      count: 23,
      missingAlt: 2,
    });
    expect(parseSnapshotImages(null)).toEqual({ count: null, missingAlt: null });
  });
});
