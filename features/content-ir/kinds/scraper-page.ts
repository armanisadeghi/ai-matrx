/**
 * The scraper / `web_page` kind family — compiled `KindSchema` mirrors.
 *
 * These are the STREAMING parser's warm schemas. A registry row whose schema
 * cannot be flattened carries `kind_definition.data = NULL`, so without these
 * mirrors the parser has no shape to stream against and `applyIrKindRoute` has
 * no render path — the instance falls through to a JSON dump. (Hand-written
 * today; the SDK should emit them from `emitted_json_schema` exactly as it
 * emits the `.gen.ts` files — Open gap #2.)
 *
 * Bridges are STREAMING and uniform: serverData is `{ value, isComplete }` —
 * the envelope's live value object, verbatim. Components read defensively
 * because a half-arrived page is a NORMAL state, and the same components render
 * nested instances handed to them directly by `ScrapedPageBlock` (see
 * `components/mardown-display/blocks/scraper-kinds/`).
 *
 * Registered by the Scraper Kinds Run (data-to-kinds replication run 1).
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";
import { makeSearchKindBridge } from "./search-results";

// ---------------------------------------------------------------------------
// Primitives — system-wide small kinds held by bigger page kinds
// ---------------------------------------------------------------------------

export const pageLinkKindSchema: KindSchema = {
  kind: "page_link",
  fields: {
    target_url: { type: "string", required: true, description: "Absolute destination URL." },
    anchor_text: { type: "string", nullable: true, description: "The visible link text." },
    text_source: {
      type: "string",
      nullable: true,
      description: "'anchor' (link text) or 'image_alt' (an image's alt).",
    },
    rel: { type: "string", nullable: true },
    nofollow: { type: "boolean", description: "True when rel contains nofollow." },
    link_type: {
      type: "string",
      nullable: true,
      description: "'internal' | 'external' | 'subdomain', relative to this page.",
    },
    region: {
      type: "string",
      nullable: true,
      description: "main | body | article | nav | header | footer.",
    },
  },
};

export const linkBucketsKindSchema: KindSchema = {
  kind: "link_buckets",
  fields: {
    internal: { type: "string[]" },
    external: { type: "string[]" },
    images: { type: "string[]" },
    documents: { type: "string[]" },
    audio: { type: "string[]" },
    videos: { type: "string[]" },
    archives: { type: "string[]" },
    others: { type: "string[]" },
  },
};

export const pageImageKindSchema: KindSchema = {
  kind: "page_image",
  fields: {
    src: { type: "string", required: true },
    alt: { type: "string", nullable: true, description: "The accessibility label." },
    title: { type: "string", nullable: true },
    caption: { type: "string", nullable: true },
    width: { type: "string", nullable: true },
    height: { type: "string", nullable: true },
    srcset: { type: "string[]", description: "Responsive candidate URLs, in source order." },
  },
};

export const pageVideoKindSchema: KindSchema = {
  kind: "page_video",
  fields: {
    src: { type: "string", required: true },
    poster: { type: "string", nullable: true },
    width: { type: "string", nullable: true },
    height: { type: "string", nullable: true },
    provider: { type: "string", nullable: true },
    sources: { type: "json[]", description: "Alternate encodings: {src, type}." },
    tracks: { type: "json[]", description: "Caption/subtitle tracks." },
  },
};

export const pageAudioKindSchema: KindSchema = {
  kind: "page_audio",
  fields: {
    src: { type: "string", required: true },
    sources: { type: "json[]" },
    tracks: { type: "json[]" },
  },
};

export const pageHeadingKindSchema: KindSchema = {
  kind: "page_heading",
  fields: {
    level: { type: "number", required: true, description: "Heading depth; 0 is the preamble." },
    text: { type: "string", required: true },
  },
};

export const pageSectionKindSchema: KindSchema = {
  kind: "page_section",
  fields: {
    heading: { type: "string", required: true },
    markdown: { type: "string", required: true },
  },
};

export const pageListKindSchema: KindSchema = {
  kind: "page_list",
  fields: {
    items: { type: "string[]" },
    ordered: { type: "boolean", description: "True for a numbered list." },
    before: { type: "string", nullable: true },
    after: { type: "string", nullable: true },
  },
};

export const codeBlockKindSchema: KindSchema = {
  kind: "code_block",
  fields: {
    code: { type: "string", required: true },
    language: { type: "string", nullable: true },
  },
};

export const pageBlockKindSchema: KindSchema = {
  kind: "page_block",
  fields: {
    type: {
      type: "string",
      required: true,
      description: "text | header | list | code | table | image | video | audio | quote.",
    },
    level: { type: "number", nullable: true },
    text: { type: "string", nullable: true },
    items: { type: "string[]" },
    rows: { type: "json[]", description: "Row objects, for type='table'." },
    src: { type: "string", nullable: true },
    alt: { type: "string", nullable: true },
    before: { type: "string", nullable: true },
    after: { type: "string", nullable: true },
  },
};

export const redirectHopKindSchema: KindSchema = {
  kind: "redirect_hop",
  fields: {
    status: { type: "number", required: true },
    url: { type: "string", required: true },
  },
};

export const contentFingerprintKindSchema: KindSchema = {
  kind: "content_fingerprint",
  fields: {
    simhash: {
      type: "string",
      nullable: true,
      description: "64-bit simhash as a DECIMAL STRING — as a number it rounds in JavaScript.",
    },
    outline_simhash: { type: "string", nullable: true },
    minhash: { type: "json[]", description: "MinHash signature vector." },
  },
};

export const pageMetadataKindSchema: KindSchema = {
  kind: "page_metadata",
  fields: {
    canonical_url: { type: "string", nullable: true },
    robots_directives: { type: "string", nullable: true },
    meta_tags: { type: "json", description: "Every meta tag, name → content." },
    open_graph: { type: "json", description: "OpenGraph properties as an object." },
    json_ld: { type: "json[]", description: "Parsed schema.org JSON-LD objects." },
  },
};

export const pageRemovalKindSchema: KindSchema = {
  kind: "page_removal",
  fields: {
    remover: { type: "string", required: true, description: "noise_remover | content_filter." },
    attribute: { type: "string", nullable: true },
    match_type: { type: "string", nullable: true },
    trigger_value: { type: "string", nullable: true },
    text: { type: "string", nullable: true, description: "The readable text that was removed." },
    html_length: { type: "number", nullable: true },
  },
};

export const pageCleaningReportKindSchema: KindSchema = {
  kind: "page_cleaning_report",
  fields: {
    removed: { type: "array", itemKinds: ["page_removal"] },
    noise_removed_count: { type: "number" },
    filter_removed_count: { type: "number" },
    removed_char_total: { type: "number" },
    tables_in_page: { type: "number", nullable: true },
    code_blocks_in_page: { type: "number", nullable: true },
    lists_in_page: { type: "number", nullable: true },
  },
};

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export const scrapedPageKindSchema: KindSchema = {
  kind: "scraped_page",
  fields: {
    // legacy contract — unchanged by the distillation
    url: { type: "string", required: true },
    response_url: { type: "string", nullable: true },
    status_code: { type: "number" },
    title: { type: "string", nullable: true },
    published_at: { type: "string", nullable: true },
    content_type: { type: "string", nullable: true },
    text: { type: "string", description: "Best-available readable text." },
    markdown: { type: "string", nullable: true },
    scraped_at: { type: "string", nullable: true },
    // outcome
    success: { type: "boolean", nullable: true },
    failure_reason: { type: "string", nullable: true },
    failure_details: { type: "json[]" },
    // identity / provenance
    modified_at: { type: "string", nullable: true },
    content_type_raw: { type: "string", nullable: true },
    site_name: { type: "string", nullable: true },
    page_key: { type: "string", nullable: true },
    char_count: { type: "number", nullable: true },
    char_count_with_markers: { type: "number", nullable: true },
    cms: { type: "string", nullable: true },
    firewall: { type: "string", nullable: true },
    // transport
    ttfb_ms: {
      type: "number",
      nullable: true,
      description: "True TTFB. Null means NOT MEASURED — never read it as fast.",
    },
    security_headers: { type: "json", nullable: true },
    redirect_chain: { type: "array", itemKinds: ["redirect_hop"] },
    // what the page says about itself
    metadata: { type: "object", kind: "page_metadata", nullable: true },
    // readable projections
    plain_text: {
      type: "string",
      nullable: true,
      description: "Code included, link markup stripped. NOT a subset of research_text.",
    },
    research_text: {
      type: "string",
      nullable: true,
      description: "Link markup kept, code excluded. The complement of plain_text.",
    },
    sections: { type: "array", itemKinds: ["page_section"] },
    // structure
    outline: { type: "array", itemKinds: ["page_heading"] },
    blocks: { type: "array", itemKinds: ["page_block"] },
    tables: { type: "array", itemKinds: ["parsed_table"] },
    code_blocks: { type: "array", itemKinds: ["code_block"] },
    lists: { type: "array", itemKinds: ["page_list"] },
    // media
    images: { type: "array", itemKinds: ["page_image"] },
    main_image: { type: "string", nullable: true },
    videos: { type: "array", itemKinds: ["page_video"] },
    audios: { type: "array", itemKinds: ["page_audio"] },
    // links
    links: { type: "array", itemKinds: ["page_link"] },
    link_urls: { type: "object", kind: "link_buckets", nullable: true },
    // signatures and audit
    fingerprint: { type: "object", kind: "content_fingerprint", nullable: true },
    cleaning: { type: "object", kind: "page_cleaning_report", nullable: true },
    // non-HTML
    raw_text: { type: "string", nullable: true },
  },
};

export const scraperBatchResultKindSchema: KindSchema = {
  kind: "scraper_batch_result",
  fields: {
    pages: { type: "array", itemKinds: ["scraped_page"] },
    successful: { type: "number" },
    failed: { type: "number" },
  },
};

export const scraperCrawlResultKindSchema: KindSchema = {
  kind: "scraper_crawl_result",
  fields: {
    seed_url: { type: "string" },
    pages: { type: "array", itemKinds: ["scraped_page"] },
    total_pages: { type: "number" },
  },
};

const ALL_SCHEMAS: KindSchema[] = [
  scrapedPageKindSchema,
  scraperBatchResultKindSchema,
  scraperCrawlResultKindSchema,
  pageLinkKindSchema,
  linkBucketsKindSchema,
  pageImageKindSchema,
  pageVideoKindSchema,
  pageAudioKindSchema,
  pageHeadingKindSchema,
  pageSectionKindSchema,
  pageListKindSchema,
  pageBlockKindSchema,
  codeBlockKindSchema,
  redirectHopKindSchema,
  contentFingerprintKindSchema,
  pageMetadataKindSchema,
  pageRemovalKindSchema,
  pageCleaningReportKindSchema,
];

export const SCRAPER_PAGE_KIND_DEFINITIONS: KindDefinition[] = ALL_SCHEMAS.map(
  (schema): KindDefinition => ({
    kind: schema.kind,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: schema.kind,
    toLegacyServerData: makeSearchKindBridge(schema.kind),
    persistence: { persistStructured: true },
    ...(schema.kind === "scraped_page" ? { loadingComponent: "list" as const } : {}),
    schema,
  }),
);
