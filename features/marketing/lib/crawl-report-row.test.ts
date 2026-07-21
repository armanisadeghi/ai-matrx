import type { InspectionSnapshotRow } from "@/features/marketing/data/inspection-types";
import { toCrawlSnapshotReportRow } from "@/features/marketing/lib/crawl-report-row";

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
});
