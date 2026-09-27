/**
 * features/source-studio/webSourceAdapter.ts
 *
 * THE ONE adapter from what a web Source holds to what the scraper's own
 * result screen reads (`features/scraper/parts/core/PageContent` via
 * `ScraperDataUtils.processFullData`). A web Source opens in the scraper's
 * result UI — Pretty, Reader, Organized, Structured, Images, Text, Metadata,
 * SEO, headers, the analysis tabs, the JSON — never as a slide-show of its
 * heading fragments (Arman, 2026-09-27).
 *
 * A web Source holds, whatever client landed it:
 *   - its stored ORIGINAL (S3, gzip — the caller hands the decompressed text):
 *       · the extension:  its capture JSON (`SoupResult`: `article.content_markdown`,
 *                         `article.content_html_safe`, `metadata`, `seo`, `ld_json`,
 *                         `images`, `links`, …);
 *       · the scraper:    the fetched page HTML;
 *       · none at all     (older rows, crawl rows before their body landed);
 *   - its `structured_json`: the extension's collectors, or the scraper's
 *     non-text half (`links`, `images`, `document_outline`, `metadata`, `tables`, …);
 *   - its text, as SECTIONS (portions with a heading path) — an outline inside
 *     the content, never pages.
 *
 * Pure: no React, no network. Each stored shape has a fixture test.
 */

import type {
  ScrapedResult,
  ScrapedResultsEnvelope,
  ScrapeEngine,
} from "@/features/scraper/types/scraper-api";
import { asScrapeEngine } from "@/features/scraper/types/scraper-api";
import ScraperDataUtils from "@/features/scraper/utils/data-utils";

/** One section of the Source's text, as the portions read gives it. */
export interface WebSection {
  /** H1–H3 heading path; empty for text above the first heading. */
  headingPath: string[];
  text: string;
}

export interface WebSourceInputs {
  name: string;
  url: string | null;
  capturedAt: string | null;
  /** The decompressed stored original, or null when there is none / it failed. */
  original: string | null;
  structured: unknown;
  sections: WebSection[];
  /** `metadata.captured_by_rung` when the server recorded one. */
  capturedByRung?: string | null;
}

export type StoredWebShape = "extension_capture" | "page_html" | "none";

export interface WebSourceView {
  shape: StoredWebShape;
  envelope: ScrapedResultsEnvelope;
  engine: ScrapeEngine | null;
}

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** The extension capture JSON, or null when the original is not one. */
export function parseExtensionCapture(original: string | null): Obj | null {
  const t = original?.trimStart() ?? "";
  if (!t.startsWith("{")) return null;
  try {
    const parsed = obj(JSON.parse(t));
    const article = obj(parsed.article);
    if (
      "content_markdown" in article ||
      "content_html_safe" in article ||
      "seo" in parsed
    )
      return parsed;
  } catch {
    return null;
  }
  return null;
}

export function detectStoredShape(original: string | null): StoredWebShape {
  if (parseExtensionCapture(original)) return "extension_capture";
  const t = original?.trimStart() ?? "";
  if (t.startsWith("<")) return "page_html";
  return "none";
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** The Source's sections as markdown: each heading at its depth, then its text. */
export function sectionsAsMarkdown(sections: WebSection[]): string {
  return sections
    .map((s) => {
      const heading = s.headingPath[s.headingPath.length - 1];
      if (!heading) return s.text.trim();
      const level = Math.min(Math.max(s.headingPath.length, 1), 6);
      // Portions start with their own heading line; do not print it twice.
      const lines = s.text.split("\n");
      const body =
        lines[0]?.trim() === heading.trim() ? lines.slice(1).join("\n") : s.text;
      return `${"#".repeat(level)} ${heading}\n\n${body.trim()}`.trim();
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Sections as the scraper's `organized_data` (header / text items). */
export function sectionsAsOrganized(sections: WebSection[]): {
  sections: Array<{ type: string; level?: number; content: string }>;
} {
  const out: Array<{ type: string; level?: number; content: string }> = [];
  for (const s of sections) {
    const heading = s.headingPath[s.headingPath.length - 1];
    let lines = s.text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (heading) {
      out.push({ type: "header", level: Math.max(s.headingPath.length, 1), content: heading });
      if (lines[0] === heading.trim()) lines = lines.slice(1);
    }
    for (const line of lines) out.push({ type: "text", content: line });
  }
  return { sections: out };
}

/** The scraper's outline map (`"H2: Title": [...]`) from heading items. */
function outlineFrom(
  headings: Array<{ level: number; text: string }>,
): Record<string, string[]> {
  const outline: Record<string, string[]> = {};
  for (const h of headings) {
    if (!h.text || h.level < 1 || h.level > 6) continue;
    let key = `H${h.level}: ${h.text}`;
    // Duplicate headings keep their own entry (the map is keyed by text).
    let n = 2;
    while (key in outline) key = `H${h.level}: ${h.text} (${n++})`;
    outline[key] = [];
  }
  return outline;
}

function countTags(html: string | null, pattern: RegExp): number {
  return html ? (html.match(pattern) ?? []).length : 0;
}

/** Split absolute links into the scraper's internal / external lists by host. */
function splitLinks(hrefs: string[], pageUrl: string | null) {
  const host = hostOf(pageUrl);
  const internal: string[] = [];
  const external: string[] = [];
  for (const href of hrefs) {
    const h = hostOf(href);
    if (!h) continue;
    (host && h === host ? internal : external).push(href);
  }
  return { internal: [...new Set(internal)], external: [...new Set(external)] };
}

function imageSrcs(v: unknown): string[] {
  return arr(v)
    .map((i) => (typeof i === "string" ? i : str(obj(i).src)))
    .filter((s): s is string => !!s);
}

// ── The extension capture ─────────────────────────────────────────────────

function fromExtension(
  capture: Obj,
  structured: Obj,
  inputs: WebSourceInputs,
): ScrapedResult {
  const article = obj(capture.article);
  const metadata = { ...obj(structured.metadata), ...obj(capture.metadata) };
  const seo = obj(capture.seo);
  const url = str(capture.url) ?? str(structured.url) ?? inputs.url ?? "";
  const html = str(article.content_html_safe);
  const markdown =
    str(article.content_markdown) ?? sectionsAsMarkdown(inputs.sections);
  const text = inputs.sections.map((s) => s.text).join("\n\n");
  const title =
    str(article.title) ?? str(metadata.title) ?? str(obj(seo.title).value) ?? inputs.name;
  const headings = arr(seo.headings)
    .map((h) => ({ level: Number(obj(h).level), text: str(obj(h).text) ?? "" }))
    .filter((h) => h.text);
  const images = imageSrcs(capture.images ?? structured.images);
  const linkHrefs = arr(capture.links ?? structured.links)
    .map((l) => str(obj(l).href))
    .filter((s): s is string => !!s);
  const og = obj(metadata.og);
  const twitter = obj(metadata.twitter);
  const ldJson = arr(capture.ld_json ?? structured.ld_json);
  const metaTags: Obj = {};
  if (str(metadata.description)) metaTags.description = metadata.description;
  if (str(seo.robots)) metaTags.robots = seo.robots;
  if (str(metadata.lang)) metaTags.lang = metadata.lang;
  if (str(article.byline)) metaTags.author = article.byline;
  if (str(metadata.published_time)) metaTags.published_time = metadata.published_time;
  if (str(metadata.modified_time)) metaTags.modified_time = metadata.modified_time;
  for (const [k, v] of Object.entries(twitter)) metaTags[`twitter:${k}`] = v;

  return {
    success: true,
    failure_reason: null,
    url,
    markdown_renderable: markdown,
    text_data: text || markdown,
    organized_data: sectionsAsOrganized(inputs.sections),
    structured_data: ldJson.length ? { ld_json: ldJson } : {},
    main_image: str(og.image) ?? images[0] ?? undefined,
    links: {
      ...splitLinks(linkHrefs, url),
      images,
      videos: imageSrcs(capture.videos ?? structured.videos),
      audio: imageSrcs(capture.audio ?? structured.audio),
    },
    hashes: null,
    content_filter_removal_details: [],
    scraped_at:
      typeof capture.capturedAt === "number"
        ? new Date(capture.capturedAt).toISOString()
        : (inputs.capturedAt ?? undefined),
    overview: {
      page_title: title,
      url,
      website: hostOf(url) ?? undefined,
      char_count: text.length,
      char_count_formatted: text.length,
      has_structured_content: ldJson.length > 0,
      outline: outlineFrom(headings),
      table_count: countTags(html, /<table\b/gi),
      code_block_count: countTags(html, /<pre\b/gi),
      list_count: countTags(html, /<(ul|ol)\b/gi),
      word_count: typeof article.word_count === "number" ? article.word_count : undefined,
      reading_time_minutes:
        typeof article.reading_time_minutes === "number"
          ? article.reading_time_minutes
          : undefined,
      extractor: str(article.extractor) ?? undefined,
      metadata: {
        "json-ld": ldJson,
        opengraph: og,
        meta_tags: metaTags,
        canonical_url: str(metadata.canonical) ?? str(seo.canonical),
        structured_data: ldJson,
        robots_directives: str(seo.robots),
      },
    },
  };
}

// ── The scraper (page HTML original + structured non-text half) ───────────

/** What a page's own `<head>` says, read with the browser's parser when present. */
function headFacts(html: string | null): {
  title: string | null;
  description: string | null;
  canonical: string | null;
  og: Obj;
} {
  const none = { title: null, description: null, canonical: null, og: {} };
  if (!html || typeof DOMParser === "undefined") return none;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const og: Obj = {};
    doc.querySelectorAll('meta[property^="og:"]').forEach((m) => {
      const k = m.getAttribute("property")?.slice(3);
      const v = m.getAttribute("content");
      if (k && v) og[k] = v;
    });
    return {
      title: doc.querySelector("title")?.textContent?.trim() || null,
      description:
        doc.querySelector('meta[name="description"]')?.getAttribute("content") ?? null,
      canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
      og,
    };
  } catch {
    return none;
  }
}

function fromScraper(
  html: string | null,
  structured: Obj,
  inputs: WebSourceInputs,
): ScrapedResult {
  const head = headFacts(html);
  const url = inputs.url ?? "";
  const text = inputs.sections.map((s) => s.text).join("\n\n");
  const outlineItems = arr(structured.document_outline)
    .map((h) => ({ level: Number(obj(h).level), text: str(obj(h).content) ?? "" }))
    .filter((h) => h.level >= 1);
  const headings = outlineItems.length
    ? outlineItems
    : inputs.sections
        .filter((s) => s.headingPath.length)
        .map((s) => ({
          level: s.headingPath.length,
          text: s.headingPath[s.headingPath.length - 1],
        }));
  const links = obj(structured.links);
  const images = imageSrcs(structured.images);
  const meta = obj(structured.metadata);
  const metadata = Object.keys(meta).length
    ? meta
    : {
        "json-ld": [],
        opengraph: head.og,
        meta_tags: head.description ? { description: head.description } : {},
        canonical_url: head.canonical,
        structured_data: [],
        robots_directives: null,
      };
  const structuredData = obj(structured.structured_data);

  return {
    success: true,
    failure_reason: null,
    url,
    markdown_renderable: sectionsAsMarkdown(inputs.sections),
    text_data: text,
    organized_data: sectionsAsOrganized(inputs.sections),
    structured_data: structuredData,
    tables: arr(structured.tables),
    code_blocks: arr(structured.code_blocks),
    main_image: str(structured.main_image) ?? str(head.og.image) ?? images[0] ?? undefined,
    links: {
      internal: arr(links.internal) as string[],
      external: arr(links.external) as string[],
      images: (arr(links.images) as string[]).length ? (arr(links.images) as string[]) : images,
      documents: arr(links.documents) as string[],
      others: arr(links.others) as string[],
      audio: arr(links.audio) as string[],
      videos: arr(links.videos) as string[],
      archives: arr(links.archives) as string[],
    },
    hashes: (structured.hashes as ScrapedResult["hashes"]) ?? null,
    content_filter_removal_details: [],
    scraped_at: inputs.capturedAt ?? undefined,
    cms: str(structured.cms) ?? undefined,
    status_code: typeof structured.status_code === "number" ? structured.status_code : undefined,
    overview: {
      page_title: head.title ?? inputs.name,
      url,
      website: hostOf(url) ?? undefined,
      char_count: text.length,
      char_count_formatted: text.length,
      has_structured_content: Object.keys(structuredData).length > 0,
      outline: outlineFrom(headings),
      table_count: arr(structured.tables).length,
      code_block_count: arr(structured.code_blocks).length,
      list_count: countTags(html, /<(ul|ol)\b/gi),
      metadata,
    },
  };
}

/**
 * THE adapter: what a web Source holds → the scraper result envelope its
 * result screen reads (`ScraperDataUtils.processFullData(envelope)`).
 */
export function webSourceToScrape(inputs: WebSourceInputs): WebSourceView {
  const structured = obj(inputs.structured);
  const capture = parseExtensionCapture(inputs.original);
  const shape = detectStoredShape(inputs.original);
  const result = capture
    ? fromExtension(capture, structured, inputs)
    : fromScraper(shape === "page_html" ? inputs.original : null, structured, inputs);
  const engine = asScrapeEngine(inputs.capturedByRung ?? null);
  if (engine) result.engine = engine;
  return {
    shape,
    engine,
    envelope: { type: "fetch_results", metadata: {}, results: [result] },
  };
}

/**
 * The `pageData` the result screen (`PageContent`) takes, built by the
 * scraper's own `processFullData`. That processor keeps `structured_data` only
 * under a legacy "Ordered Lists" key, so the Source's structured data (JSON-LD,
 * the scraper's structured half) is carried through as the adapter built it —
 * otherwise the Structured tab would say "none" for data the Source holds.
 */
export function webSourcePageData(view: WebSourceView) {
  const processed = ScraperDataUtils.processFullData(view.envelope);
  const built = view.envelope.results[0];
  return {
    ...processed,
    results: processed.results.map((r, i) =>
      i === 0 && built?.structured_data && Object.keys(built.structured_data).length
        ? { ...r, structured_data: built.structured_data }
        : r,
    ),
  };
}
