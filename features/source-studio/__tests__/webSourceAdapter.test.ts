/**
 * THE web Source adapter (2026-09-27): whatever a web Source holds — the
 * extension's capture JSON, the scraper's page HTML + structured half, or no
 * original at all — becomes the envelope the scraper's own result screen reads,
 * and its sections become an outline INSIDE the content, never pages.
 *
 * Every fixture is synthetic (example.test pages), never a real capture.
 */
import ScraperDataUtils from "@/features/scraper/utils/data-utils";
import { processOrganizedData } from "@/features/scraper/utils/scraper-utils";
import {
  detectStoredShape,
  sectionsAsMarkdown,
  webSourcePageData,
  webSourceToScrape,
  type WebSection,
} from "@/features/source-studio/webSourceAdapter";

const SECTIONS: WebSection[] = [
  { headingPath: [], text: "A short intro above every heading." },
  {
    headingPath: ["Growing Tomatoes"],
    text: "Growing Tomatoes\nTomatoes like sun.\nWater them often.",
  },
  {
    headingPath: ["Growing Tomatoes", "Soil"],
    text: "Soil\nUse loose, rich soil.",
  },
];

/** A synthetic extension capture (`SoupResult` shape from matrx-extend). */
const EXTENSION_CAPTURE = {
  url: "https://garden.example.test/tomatoes",
  capturedAt: Date.UTC(2026, 8, 1, 12, 0, 0),
  metadata: {
    title: "Tomatoes | Example Garden",
    description: "How to grow tomatoes.",
    canonical: "https://garden.example.test/tomatoes",
    lang: "en",
    og: { image: "https://garden.example.test/og.png", title: "Tomatoes" },
    twitter: { card: "summary" },
    schemaTypes: ["Article"],
    published_time: "2026-08-01",
    modified_time: null,
  },
  article: {
    title: "Growing Tomatoes",
    byline: "A. Gardener",
    content_html_safe:
      "<h1>Growing Tomatoes</h1><p>Tomatoes like sun.</p><ul><li>Water</li></ul><table><tr><td>x</td></tr></table>",
    content_markdown:
      "# Growing Tomatoes\n\nTomatoes like [sun](https://sun.example.test).\n\n![leaf](https://garden.example.test/leaf.png)",
    excerpt: "Tomatoes like sun.",
    extractor: "defuddle",
    word_count: 120,
    reading_time_minutes: 1,
  },
  images: [{ src: "https://garden.example.test/leaf.png", alt: "leaf", width: 10, height: 10 }],
  videos: [],
  audio: [],
  links: [
    { href: "https://garden.example.test/peppers", text: "Peppers", rel: null },
    { href: "https://sun.example.test/", text: "Sun", rel: null },
  ],
  ld_json: [{ "@type": "Article", headline: "Growing Tomatoes" }],
  seo: {
    url: "https://garden.example.test/tomatoes",
    title: { value: "Tomatoes | Example Garden", length: 25 },
    description: { value: "How to grow tomatoes.", length: 21 },
    canonical: "https://garden.example.test/tomatoes",
    robots: "index,follow",
    headings: [
      { level: 1, text: "Growing Tomatoes" },
      { level: 2, text: "Soil" },
    ],
  },
  raw_html_size: 5000,
};

/** A synthetic scraper Source: page HTML original + the structured half. */
const PAGE_HTML =
  '<html><head><title>Tomatoes | Example Garden</title><meta name="description" content="How to grow tomatoes."><meta property="og:image" content="https://garden.example.test/og.png"></head><body><h1>Growing Tomatoes</h1><ul><li>a</li></ul></body></html>';
const SCRAPER_STRUCTURED = {
  links: {
    internal: ["https://garden.example.test/peppers"],
    external: ["https://sun.example.test/"],
    images: ["https://garden.example.test/leaf.png"],
    documents: [],
    others: [],
    audio: [],
    videos: [],
    archives: [],
  },
  document_outline: [
    { type: "header", level: 0, content: "unassociated" },
    { type: "header", level: 1, content: "Growing Tomatoes" },
    { type: "header", level: 2, content: "Soil" },
  ],
  tables: [{ rows: [] }],
  code_blocks: [],
  metadata: {
    "json-ld": [],
    meta_tags: { description: "How to grow tomatoes." },
    opengraph: { image: "https://garden.example.test/og.png" },
    canonical_url: null,
    structured_data: [],
    robots_directives: null,
  },
};

function firstResult(view: ReturnType<typeof webSourceToScrape>) {
  return webSourcePageData(view).results[0];
}

describe("detectStoredShape", () => {
  it("names each stored original", () => {
    expect(detectStoredShape(JSON.stringify(EXTENSION_CAPTURE))).toBe("extension_capture");
    expect(detectStoredShape(PAGE_HTML)).toBe("page_html");
    expect(detectStoredShape(null)).toBe("none");
    expect(detectStoredShape('{"not":"a capture"}')).toBe("none");
  });
});

describe("the extension capture → the scraper result screen", () => {
  const view = webSourceToScrape({
    name: "Growing Tomatoes",
    url: "https://garden.example.test/tomatoes",
    capturedAt: null,
    original: JSON.stringify(EXTENSION_CAPTURE),
    structured: {},
    sections: SECTIONS,
  });
  const r = firstResult(view);

  it("renders the capture's own rich markdown in Pretty", () => {
    expect(view.shape).toBe("extension_capture");
    expect(r.markdown_renderable).toContain("[sun](https://sun.example.test)");
    expect(r.markdown_renderable).toContain("![leaf]");
  });

  it("fills the overview, outline and SEO facts from the capture", () => {
    expect(r.overview.page_title).toBe("Growing Tomatoes");
    expect(r.overview.website).toBe("garden.example.test");
    expect(r.overview.table_count).toBe(1);
    expect(r.overview.list_count).toBe(1);
    expect(Object.keys(r.outline)).toEqual(["H1: Growing Tomatoes", "H2: Soil"]);
    const seo = ScraperDataUtils.performSEOAnalysis(r.overview, r.structured_data);
    expect(seo.headerAnalysis.h1Count).toBe(1);
    expect(r.overview_metadata).toMatchObject({
      opengraph: { image: "https://garden.example.test/og.png" },
      canonical_url: "https://garden.example.test/tomatoes",
    });
  });

  it("splits links by host and carries images, JSON-LD and the capture time", () => {
    expect(r.links.internal).toEqual(["https://garden.example.test/peppers"]);
    expect(r.links.external).toEqual(["https://sun.example.test/"]);
    expect(r.links.images).toEqual(["https://garden.example.test/leaf.png"]);
    expect(r.main_image).toBe("https://garden.example.test/og.png");
    expect(r.structured_data).toEqual({ ld_json: EXTENSION_CAPTURE.ld_json });
    expect(r.scraped_at).toBe("2026-09-01T12:00:00.000Z");
  });

  it("turns the sections into ONE organized outline, not pages", () => {
    const organized = processOrganizedData(r.organized_data);
    expect(organized.map((s: { heading: { text: string } }) => s.heading.text)).toEqual([
      "",
      "Growing Tomatoes",
      "Soil",
    ]);
    // The heading line inside a portion is not repeated as body text.
    expect(JSON.stringify(organized[1].content)).not.toContain('"Growing Tomatoes"');
  });
});

describe("the scraper's page HTML + structured half → the scraper result screen", () => {
  const view = webSourceToScrape({
    name: "Fallback name",
    url: "https://garden.example.test/tomatoes",
    capturedAt: "2026-09-02T00:00:00Z",
    original: PAGE_HTML,
    structured: SCRAPER_STRUCTURED,
    sections: SECTIONS,
    capturedByRung: "browser",
  });
  const r = firstResult(view);

  it("reads the title from the page and keeps the scraper's own links and metadata", () => {
    expect(view.shape).toBe("page_html");
    expect(view.engine).toBe("browser");
    expect(r.overview.page_title).toBe("Tomatoes | Example Garden");
    expect(r.links.internal).toEqual(SCRAPER_STRUCTURED.links.internal);
    expect(r.overview_metadata).toMatchObject({
      meta_tags: { description: "How to grow tomatoes." },
    });
    expect(r.overview.table_count).toBe(1);
    expect(r.scraped_at).toBe("2026-09-02T00:00:00Z");
  });

  it("keeps a JSON-LD list from the structured half", () => {
    const blocks = [{ "@type": "Article" }];
    const v = webSourceToScrape({
      name: "n", url: null, capturedAt: null, original: PAGE_HTML,
      structured: { ...SCRAPER_STRUCTURED, structured_data: blocks }, sections: SECTIONS,
    });
    expect(firstResult(v).structured_data).toEqual(blocks);
    expect(firstResult(v).overview.has_structured_content).toBe(true);
  });

  it("builds the outline from document_outline, dropping the unassociated bucket", () => {
    expect(Object.keys(r.outline)).toEqual(["H1: Growing Tomatoes", "H2: Soil"]);
  });

  it("renders the sections as headed markdown in Pretty", () => {
    expect(r.markdown_renderable).toBe(sectionsAsMarkdown(SECTIONS));
    expect(r.markdown_renderable).toContain("# Growing Tomatoes\n\nTomatoes like sun.");
    expect(r.markdown_renderable).toContain("## Soil\n\nUse loose, rich soil.");
  });
});

/** A synthetic scraper-stored envelope (aidream `scraper_page_envelope`). */
const SCRAPER_ENVELOPE = {
  __kind: "scraper_fetch_results.v1",
  type: "fetch_results",
  metadata: { shape: "scraper_fetch_results.v1", raw_html_kept: true, raw_html: PAGE_HTML },
  results: [
    {
      success: true,
      url: "https://garden.example.test/tomatoes",
      engine: "http",
      markdown_renderable: "# Growing Tomatoes\n\n**Tomatoes** like [sun](https://sun.example.test).",
      text_data: "Growing Tomatoes. Tomatoes like sun.",
      organized_data: {
        sections: [
          { type: "header", level: 1, content: "Growing Tomatoes" },
          { type: "text", content: "Tomatoes like sun." },
        ],
      },
      structured_data: { "Ordered Lists": [["Water", "Feed"]] },
      overview: {
        page_title: "Tomatoes | Example Garden",
        url: "https://garden.example.test/tomatoes",
        website: "garden.example.test",
        char_count: 36,
        outline: { "H1: Growing Tomatoes": [] },
        table_count: 0,
        list_count: 1,
        code_block_count: 0,
      },
      links: SCRAPER_STRUCTURED.links,
      main_image: "https://garden.example.test/og.png",
      scraped_at: "2026-09-03T00:00:00Z",
    },
  ],
};

describe("the scraper's stored fetch_results envelope → shown exactly as the live scraper result", () => {
  const view = webSourceToScrape({
    name: "Fallback name",
    url: "https://garden.example.test/tomatoes",
    capturedAt: null,
    original: JSON.stringify(SCRAPER_ENVELOPE),
    structured: { ...SCRAPER_STRUCTURED, original_shape: "scraper_fetch_results.v1" },
    sections: SECTIONS,
  });
  const r = firstResult(view);

  it("is preferred over everything else the Source holds", () => {
    expect(detectStoredShape(JSON.stringify(SCRAPER_ENVELOPE))).toBe("scraper_envelope");
    expect(view.shape).toBe("scraper_envelope");
    expect(view.engine).toBe("http");
  });

  it("keeps the scraper's own rich markdown, organized data and overview", () => {
    expect(r.markdown_renderable).toContain("**Tomatoes** like [sun]");
    expect(r.markdown_renderable).not.toContain("Use loose, rich soil");
    expect(r.overview.page_title).toBe("Tomatoes | Example Garden");
    expect(r.organized_data).toEqual(SCRAPER_ENVELOPE.results[0].organized_data);
    expect(r.structured_data).toEqual([["Water", "Feed"]]);
    expect(r.scraped_at).toBe("2026-09-03T00:00:00Z");
  });

  it("drops the raw page HTML from the envelope the JSON tabs show", () => {
    expect(JSON.stringify(view.envelope)).not.toContain("<html>");
    expect(view.envelope.metadata).toEqual({
      shape: "scraper_fetch_results.v1",
      raw_html_kept: true,
    });
  });
});

describe("a web Source with no stored original", () => {
  it("still opens in the result screen from its sections alone", () => {
    const view = webSourceToScrape({
      name: "Only text",
      url: null,
      capturedAt: null,
      original: null,
      structured: null,
      sections: SECTIONS,
    });
    const r = firstResult(view);
    expect(view.shape).toBe("none");
    expect(view.engine).toBeNull();
    expect(r.overview.page_title).toBe("Only text");
    expect(Object.keys(r.outline)).toEqual(["H1: Growing Tomatoes", "H2: Soil"]);
    expect(r.text_data).toContain("Use loose, rich soil.");
  });
});
