import type { Json } from "@/types/database.types";
import { isJsonRecord } from "@/features/marketing/types";

/**
 * Typed narrowing over the scraper-persisted `web.snapshot` JSON columns
 * (`headings`, `links_summary`, `extracted`, `images`). Companion to
 * `lib/head-tags.ts` — components never poke raw snapshot JSON.
 */

export interface SnapshotHeadingEntry {
  text: string;
  level: number;
}

export interface ParsedSnapshotHeadings {
  /** Document-ordered outline. */
  all: SnapshotHeadingEntry[];
  h1Count: number;
}

/** Normalize `web.snapshot.headings` (`{ all: [{text, level}], h1_count }`). */
export function parseSnapshotHeadings(headings: Json): ParsedSnapshotHeadings {
  if (!isJsonRecord(headings)) return { all: [], h1Count: 0 };
  const all = Array.isArray(headings.all)
    ? headings.all.flatMap((entry): SnapshotHeadingEntry[] => {
        if (!isJsonRecord(entry)) return [];
        const text = typeof entry.text === "string" ? entry.text.trim() : "";
        const level =
          typeof entry.level === "number" && Number.isInteger(entry.level)
            ? entry.level
            : null;
        return text && level !== null && level >= 1 && level <= 6
          ? [{ text, level }]
          : [];
      })
    : [];
  const h1Count =
    typeof headings.h1_count === "number" && Number.isInteger(headings.h1_count)
      ? headings.h1_count
      : all.filter((entry) => entry.level === 1).length;
  return { all, h1Count };
}

export interface ParsedSnapshotLinksSummary {
  total: number | null;
  internal: number | null;
  external: number | null;
}

function finiteNumber(
  record: { [key: string]: Json | undefined },
  key: string,
): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Normalize `web.snapshot.links_summary` (`{ total, internal, external }`). */
export function parseSnapshotLinksSummary(
  linksSummary: Json,
): ParsedSnapshotLinksSummary {
  if (!isJsonRecord(linksSummary)) {
    return { total: null, internal: null, external: null };
  }
  return {
    total: finiteNumber(linksSummary, "total"),
    internal: finiteNumber(linksSummary, "internal"),
    external: finiteNumber(linksSummary, "external"),
  };
}

export interface SnapshotRedirectHop {
  url: string;
  status: number | null;
}

export interface ParsedSnapshotExtracted {
  sentenceCount: number | null;
  fleschReadingEase: number | null;
  redirectChain: SnapshotRedirectHop[];
  mixedContentCount: number;
}

/** Normalize `web.snapshot.extracted` (readability + redirect evidence). */
export function parseSnapshotExtracted(
  extracted: Json,
): ParsedSnapshotExtracted {
  if (!isJsonRecord(extracted)) {
    return {
      sentenceCount: null,
      fleschReadingEase: null,
      redirectChain: [],
      mixedContentCount: 0,
    };
  }
  const redirectChain = Array.isArray(extracted.redirect_chain)
    ? extracted.redirect_chain.flatMap((hop): SnapshotRedirectHop[] => {
        if (!isJsonRecord(hop)) return [];
        const url = typeof hop.url === "string" ? hop.url : null;
        if (!url) return [];
        return [{ url, status: finiteNumber(hop, "status") }];
      })
    : [];
  return {
    sentenceCount: finiteNumber(extracted, "sentence_count"),
    fleschReadingEase: finiteNumber(extracted, "flesch_reading_ease"),
    redirectChain,
    mixedContentCount: Array.isArray(extracted.mixed_content)
      ? extracted.mixed_content.length
      : 0,
  };
}

export interface ParsedSnapshotImage {
  src: string | null;
  srcset: string[];
  sizes: string | null;
  /** `null` = alt attribute absent; `""` = explicitly empty (decorative). */
  alt: string | null;
  width: number | null;
  height: number | null;
  loading: string | null;
  decoding: string | null;
  fetchPriority: string | null;
  title: string | null;
  featured: boolean;
}

export interface ParsedSnapshotImages {
  count: number | null;
  missingAlt: number | null;
  /** Per-image inventory when the crawler persisted one (`items` or `images`
   *  array of `{src, alt, width, height, loading, title}` — all optional).
   *  Empty when the snapshot only carries the counts. */
  items: ParsedSnapshotImage[];
}

function optionalString(
  record: { [key: string]: Json | undefined },
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

/**
 * Normalize `web.snapshot.images` (`{ count, missing_alt }`, optionally with a
 * per-image inventory under `items` or `images`). Tolerant by design — every
 * per-image field is optional and non-record entries are skipped.
 */
export function parseSnapshotImages(images: Json): ParsedSnapshotImages {
  if (!isJsonRecord(images)) {
    return { count: null, missingAlt: null, items: [] };
  }
  const rawItems = Array.isArray(images.items)
    ? images.items
    : Array.isArray(images.images)
      ? images.images
      : [];
  const items = rawItems.flatMap((entry): ParsedSnapshotImage[] => {
    if (!isJsonRecord(entry)) return [];
    return [
      {
        src: optionalString(entry, "src"),
        srcset: Array.isArray(entry.srcset)
          ? entry.srcset.filter(
              (value): value is string => typeof value === "string",
            )
          : [],
        sizes: optionalString(entry, "sizes"),
        alt: optionalString(entry, "alt"),
        width: finiteNumber(entry, "width"),
        height: finiteNumber(entry, "height"),
        loading: optionalString(entry, "loading"),
        decoding: optionalString(entry, "decoding"),
        fetchPriority: optionalString(entry, "fetchpriority"),
        title: optionalString(entry, "title"),
        featured: entry.featured === true,
      },
    ];
  });
  return {
    count: finiteNumber(images, "count"),
    missingAlt: finiteNumber(images, "missing_alt"),
    items,
  };
}

export interface ParsedSnapshotStructuredData {
  schemaTypes: string[];
  hasPayload: boolean;
  blocks: Array<{
    source: string;
    types: string[];
    data: Record<string, Json>;
  }>;
  jsonLd: Json[];
  jsonLdRaw: string[];
  microdata: Array<Record<string, Json>>;
  rdfa: Array<Record<string, Json>>;
  microformats: Array<Record<string, Json>>;
  parseErrors: Array<Record<string, Json>>;
  blocksTruncated: boolean;
}

/** Normalize `web.snapshot.structured_data` into reportable schema evidence. */
export function parseSnapshotStructuredData(
  structuredData: Json,
): ParsedSnapshotStructuredData {
  if (!isJsonRecord(structuredData)) {
    return {
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
    };
  }
  const schemaTypes = Array.isArray(structuredData.schema_types)
    ? structuredData.schema_types.filter(
        (value): value is string => typeof value === "string" && Boolean(value),
      )
    : [];
  const schemaOrg = structuredData.schema_org;
  const hasPayload =
    (schemaOrg !== null &&
      (Array.isArray(schemaOrg)
        ? schemaOrg.length > 0
        : typeof schemaOrg === "object"
          ? Object.keys(schemaOrg).length > 0
          : false)) ||
    (Array.isArray(structuredData.json_ld) &&
      structuredData.json_ld.length > 0) ||
    (Array.isArray(structuredData.json_ld_raw) &&
      structuredData.json_ld_raw.length > 0) ||
    (Array.isArray(structuredData.microdata) &&
      structuredData.microdata.length > 0) ||
    (Array.isArray(structuredData.rdfa) && structuredData.rdfa.length > 0) ||
    (Array.isArray(structuredData.microformats) &&
      structuredData.microformats.length > 0);
  const records = (value: Json | undefined): Array<Record<string, Json>> =>
    Array.isArray(value)
      ? value.filter((entry): entry is Record<string, Json> =>
          isJsonRecord(entry),
        )
      : [];
  const blocks = records(structuredData.blocks).map((block) => ({
    source: optionalString(block, "source") ?? "structured",
    types: Array.isArray(block.types)
      ? block.types.filter(
          (value): value is string =>
            typeof value === "string" && Boolean(value),
        )
      : [],
    data: isJsonRecord(block.data) ? block.data : {},
  }));
  return {
    schemaTypes,
    hasPayload,
    blocks,
    jsonLd: Array.isArray(structuredData.json_ld)
      ? structuredData.json_ld
      : schemaOrg !== null && schemaOrg !== undefined
        ? [schemaOrg]
        : [],
    jsonLdRaw: Array.isArray(structuredData.json_ld_raw)
      ? structuredData.json_ld_raw.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
    microdata: records(structuredData.microdata),
    rdfa: records(structuredData.rdfa),
    microformats: records(structuredData.microformats),
    parseErrors: records(structuredData.parse_errors),
    blocksTruncated: structuredData.blocks_truncated === true,
  };
}

export interface ParsedSnapshotResource {
  kind: string;
  url: string;
  tag: string | null;
  sourceAttribute: string | null;
  rel: string | null;
  mimeType: string | null;
  attributes: Record<string, Json>;
}

export interface ParsedSnapshotResources {
  count: number;
  counts: Record<string, number>;
  items: ParsedSnapshotResource[];
  truncated: boolean;
}

/** Normalize the complete DOM-declared resource inventory in `extracted`. */
export function parseSnapshotResources(
  extracted: Json,
): ParsedSnapshotResources {
  if (!isJsonRecord(extracted) || !isJsonRecord(extracted.resources)) {
    return { count: 0, counts: {}, items: [], truncated: false };
  }
  const resources = extracted.resources;
  const counts: Record<string, number> = {};
  if (isJsonRecord(resources.counts)) {
    for (const [key, value] of Object.entries(resources.counts)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        counts[key] = value;
      }
    }
  }
  const items = Array.isArray(resources.items)
    ? resources.items.flatMap((entry): ParsedSnapshotResource[] => {
        if (!isJsonRecord(entry)) return [];
        const url = optionalString(entry, "url");
        if (!url) return [];
        return [
          {
            kind: optionalString(entry, "kind") ?? "other",
            url,
            tag: optionalString(entry, "tag"),
            sourceAttribute: optionalString(entry, "source_attribute"),
            rel: optionalString(entry, "rel"),
            mimeType: optionalString(entry, "mime_type"),
            attributes: isJsonRecord(entry.attributes) ? entry.attributes : {},
          },
        ];
      })
    : [];
  return {
    count: finiteNumber(resources, "count") ?? items.length,
    counts,
    items,
    truncated: resources.truncated === true,
  };
}

export interface ParsedSnapshotPageIdentity {
  featuredImage: string | null;
  featuredImageSource: string | null;
  cms: string | null;
  generator: string | null;
  applicationName: string | null;
  siteName: string | null;
  author: string | null;
  publishedAt: string | null;
  modifiedAt: string | null;
  pageTypes: string[];
  themeColor: string | null;
  htmlLang: string | null;
  locale: string | null;
  contentSection: string | null;
  shortlink: string | null;
  ampUrl: string | null;
  manifestUrl: string | null;
  apiUrls: string[];
  feedUrls: string[];
  bodyClasses: string[];
  platformSignals: string[];
  platformDetails: Record<string, Json>;
}

function imageValueUrl(value: Json | undefined): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = imageValueUrl(item);
      if (found) return found;
    }
  }
  if (isJsonRecord(value)) {
    for (const key of ["contentUrl", "url", "@id", "thumbnailUrl"]) {
      const found = imageValueUrl(value[key]);
      if (found) return found;
    }
  }
  return null;
}

function findNamedImage(value: Json | undefined, key: string): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNamedImage(item, key);
      if (found) return found;
    }
  }
  if (isJsonRecord(value)) {
    if (value[key] !== undefined) {
      const direct = imageValueUrl(value[key]);
      if (direct) return direct;
    }
    for (const child of Object.values(value)) {
      const found = findNamedImage(child, key);
      if (found) return found;
    }
  }
  return null;
}

/** Normalize crawler-derived page identity and backfill old JSON-LD captures. */
export function parseSnapshotPageIdentity(
  extracted: Json,
  structuredData: Json,
): ParsedSnapshotPageIdentity {
  const identity =
    isJsonRecord(extracted) && isJsonRecord(extracted.page_identity)
      ? extracted.page_identity
      : {};
  const structured = isJsonRecord(structuredData) ? structuredData : {};
  const pageTypes = Array.isArray(identity.page_types)
    ? identity.page_types.filter(
        (value): value is string => typeof value === "string" && Boolean(value),
      )
    : [];
  return {
    featuredImage:
      optionalString(identity, "featured_image") ??
      findNamedImage(structured.schema_org, "primaryImageOfPage") ??
      findNamedImage(structured.schema_org, "image"),
    featuredImageSource: optionalString(identity, "featured_image_source"),
    cms: optionalString(identity, "cms"),
    generator: optionalString(identity, "generator"),
    applicationName: optionalString(identity, "application_name"),
    siteName: optionalString(identity, "site_name"),
    author: optionalString(identity, "author"),
    publishedAt: optionalString(identity, "published_at"),
    modifiedAt: optionalString(identity, "modified_at"),
    pageTypes,
    themeColor: optionalString(identity, "theme_color"),
    htmlLang: optionalString(identity, "html_lang"),
    locale: optionalString(identity, "locale"),
    contentSection: optionalString(identity, "content_section"),
    shortlink: optionalString(identity, "shortlink"),
    ampUrl: optionalString(identity, "amp_url"),
    manifestUrl: optionalString(identity, "manifest_url"),
    apiUrls: Array.isArray(identity.api_urls)
      ? identity.api_urls.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
    feedUrls: Array.isArray(identity.feed_urls)
      ? identity.feed_urls.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
    bodyClasses: Array.isArray(identity.body_classes)
      ? identity.body_classes.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
    platformSignals: Array.isArray(identity.platform_signals)
      ? identity.platform_signals.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
    platformDetails: isJsonRecord(identity.platform_details)
      ? identity.platform_details
      : {},
  };
}

export interface ParsedSnapshotPerformance {
  responseTimeMs: number | null;
  bytes: number | null;
}

/** Normalize crawler timing and transfer metrics from `web.snapshot.perf`. */
export function parseSnapshotPerformance(
  performance: Json,
): ParsedSnapshotPerformance {
  if (!isJsonRecord(performance)) {
    return { responseTimeMs: null, bytes: null };
  }
  return {
    responseTimeMs: finiteNumber(performance, "response_time_ms"),
    bytes: finiteNumber(performance, "bytes"),
  };
}
