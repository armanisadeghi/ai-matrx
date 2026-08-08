import type {
  CrawlCanonicalQueryRow,
  InspectionSnapshotRow,
} from "@/features/marketing/data/inspection-types";
import {
  buildCanonicalLookup,
  evaluateCanonicalChain,
  summarizeRedirectChain,
  toCrawlSnapshotReportRow,
} from "@/features/marketing/lib/crawl-report-row";

const SNAPSHOT: InspectionSnapshotRow = {
  id: "snapshot-1",
  organization_id: "org-1",
  created_at: "2026-07-20T00:00:00Z",
  updated_at: "2026-07-20T00:00:00Z",
  created_by: null,
  updated_by: null,
  deleted_at: null,
  version: 1,
  metadata: {},
  site_id: "site-1",
  page_id: "page-1",
  session_id: "crawl-1",
  captured_at: "2026-07-20T00:00:00Z",
  final_url: "https://example.com/about/",
  http_status: 200,
  content_hash: "abc123",
  word_count: 421,
  body_file_id: "file-1",
  markdown_file_id: null,
  head_tags: {
    title: "About Example",
    meta_description: "Meet the Example team.",
    canonical_url: "https://example.com/about",
    meta_robots: "index, follow",
    lang: "en",
    hreflang: [{ lang: "en", url: "https://example.com/about" }],
  },
  headings: {
    h1_count: 1,
    all: [
      { level: 1, text: "About Example" },
      { level: 2, text: "Our team" },
    ],
  },
  links_summary: { internal: 12, external: 3, total: 15 },
  images: { count: 4, missing_alt: 1 },
  structured_data: {
    schema_types: ["AboutPage"],
    schema_org: { "@type": "AboutPage" },
  },
  perf: { response_time_ms: 180, bytes: 25000 },
  extracted: {
    sentence_count: 18,
    flesch_reading_ease: 61.2,
    mixed_content: ["http://example.com/old.js"],
  },
  seo_metrics: {
    v: 1,
    source: "scraper",
    computed_at: "2026-07-20T00:00:00Z",
    overall_ok: true,
    title: {
      pixel_width: 120,
      character_count: 13,
      desktop_ok: true,
      mobile_ok: true,
      seo_length_ok: true,
      too_short: false,
      ok: true,
      issues: [],
    },
    description: {
      pixel_width: 240,
      character_count: 22,
      desktop_ok: true,
      mobile_ok: true,
      seo_length_ok: true,
      too_short: false,
      ok: true,
      issues: [],
    },
  },
  audit_metrics: null,
  page: { url: "https://example.com/about/" },
};

describe("toCrawlSnapshotReportRow", () => {
  it("flattens every stored audit family without reading JSON in the UI", () => {
    const row = toCrawlSnapshotReportRow(SNAPSHOT);
    expect(row.title).toBe("About Example");
    expect(row.titlePixels).toBe(120);
    expect(row.canonicalState).toBe("self-referencing");
    expect(row.h1).toBe("About Example");
    expect(row.h2Count).toBe(1);
    expect(row.missingAlt).toBe(1);
    expect(row.mixedContentCount).toBe(1);
    expect(row.schemaTypes).toEqual(["AboutPage"]);
    expect(row.responseTimeMs).toBe(180);
  });

  it("classifies missing canonicals and noindex directives", () => {
    const row = toCrawlSnapshotReportRow({
      ...SNAPSHOT,
      head_tags: { meta_robots: "NOINDEX, follow" },
    });
    expect(row.canonicalState).toBe("missing");
    expect(row.indexability).toBe("noindex");
  });

  it("matches canonicals with the parity URL normalizer (scheme/host case)", () => {
    const row = toCrawlSnapshotReportRow({
      ...SNAPSHOT,
      head_tags: { canonical_url: "HTTPS://EXAMPLE.COM/about" },
    });
    expect(row.canonicalState).toBe("self-referencing");
  });
});

describe("summarizeRedirectChain", () => {
  const hops = [
    { status: 301, url: "https://example.com/a" },
    { status: 302, url: "https://example.com/b" },
    { status: 200, url: "https://example.com/c" },
  ];

  it("distinguishes unrecorded evidence from an empty chain", () => {
    expect(summarizeRedirectChain({}, 200).recorded).toBe(false);
    expect(
      summarizeRedirectChain({ redirect_chain: [] }, 200).recorded,
    ).toBe(true);
  });

  it("flags chains of two or more redirects", () => {
    const chain = summarizeRedirectChain({ redirect_chain: hops }, 200);
    expect(chain.redirectCount).toBe(2);
    expect(chain.issue).toBe("chain");
  });

  it("flags redirect-to-missing from the terminal status", () => {
    const chain = summarizeRedirectChain(
      { redirect_chain: hops.slice(0, 2) },
      404,
    );
    expect(chain.issue).toBe("redirect-to-missing");
  });

  it("flags loops over redirect-to-missing", () => {
    const chain = summarizeRedirectChain(
      {
        redirect_chain: [
          { status: 301, url: "https://example.com/a" },
          { status: 301, url: "https://example.com/b" },
          { status: 301, url: "https://example.com/a/" },
        ],
      },
      404,
    );
    expect(chain.issue).toBe("loop");
  });

  it("reports single redirects without an issue", () => {
    const chain = summarizeRedirectChain(
      { redirect_chain: hops.slice(1) },
      200,
    );
    expect(chain.redirectCount).toBe(1);
    expect(chain.issue).toBeNull();
  });
});

describe("evaluateCanonicalChain", () => {
  const canonicalRow = (
    url: string,
    canonical: string | null,
    httpStatus = 200,
  ): CrawlCanonicalQueryRow => ({
    id: `snap-${url}`,
    page_id: `page-${url}`,
    final_url: url,
    http_status: httpStatus,
    canonical_url: canonical,
    page: { url },
  });

  it("resolves a healthy canonical target", () => {
    const lookup = buildCanonicalLookup([
      canonicalRow("https://example.com/b", "https://example.com/b"),
    ]);
    const chain = evaluateCanonicalChain(
      { url: "https://example.com/a", canonicalUrl: "https://example.com/b" },
      lookup,
    );
    expect(chain.state).toBe("canonicalized");
    expect(chain.targetStatus).toBe(200);
  });

  it("detects canonical-to-noncanonical chains (A → B → C)", () => {
    const lookup = buildCanonicalLookup([
      canonicalRow("https://example.com/b", "https://example.com/c"),
      canonicalRow("https://example.com/c", "https://example.com/c"),
    ]);
    const chain = evaluateCanonicalChain(
      { url: "https://example.com/a", canonicalUrl: "https://example.com/b" },
      lookup,
    );
    expect(chain.state).toBe("chain");
    expect(chain.path).toEqual([
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c",
    ]);
    expect(chain.targetCanonicalUrl).toBe("https://example.com/c");
  });

  it("detects canonical loops", () => {
    const lookup = buildCanonicalLookup([
      canonicalRow("https://example.com/b", "https://example.com/a"),
      canonicalRow("https://example.com/a", "https://example.com/b"),
    ]);
    const chain = evaluateCanonicalChain(
      { url: "https://example.com/a", canonicalUrl: "https://example.com/b" },
      lookup,
    );
    expect(chain.state).toBe("loop");
  });

  it("flags canonical targets that answered with an error", () => {
    const lookup = buildCanonicalLookup([
      canonicalRow("https://example.com/gone", null, 404),
    ]);
    const chain = evaluateCanonicalChain(
      {
        url: "https://example.com/a",
        canonicalUrl: "https://example.com/gone",
      },
      lookup,
    );
    expect(chain.state).toBe("canonical-to-error");
    expect(chain.targetStatus).toBe(404);
  });

  it("says target-not-crawled honestly instead of guessing", () => {
    const chain = evaluateCanonicalChain(
      {
        url: "https://example.com/a",
        canonicalUrl: "https://example.com/uncaptured",
      },
      buildCanonicalLookup([]),
    );
    expect(chain.state).toBe("target-not-crawled");
  });
});
