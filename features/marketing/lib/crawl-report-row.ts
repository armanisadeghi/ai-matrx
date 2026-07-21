import type { InspectionSnapshotRow } from "@/features/marketing/data/inspection-types";
import { parseSnapshotHeadTags } from "@/features/marketing/lib/head-tags";
import {
  parseSnapshotExtracted,
  parseSnapshotHeadings,
  parseSnapshotImages,
  parseSnapshotLinksSummary,
  parseSnapshotPerformance,
  parseSnapshotStructuredData,
} from "@/features/marketing/lib/snapshot-content";
import { parseStoredSeoMetrics } from "@/features/seo/serp/metrics";

export type CanonicalState = "self-referencing" | "canonicalized" | "missing";
export type IndexabilityState = "indexable" | "noindex";

/** Flat, reusable view model shared by every snapshot-backed crawl report. */
export interface CrawlSnapshotReportRow {
  id: string;
  pageId: string;
  url: string;
  capturedAt: string;
  httpStatus: number | null;
  title: string | null;
  titleChars: number | null;
  titlePixels: number | null;
  titleOk: boolean | null;
  metaDescription: string | null;
  descriptionChars: number | null;
  descriptionPixels: number | null;
  descriptionOk: boolean | null;
  h1: string | null;
  h1Count: number;
  h2Count: number;
  outline: string;
  canonicalUrl: string | null;
  canonicalState: CanonicalState;
  metaRobots: string | null;
  indexability: IndexabilityState;
  lang: string | null;
  hreflangCount: number;
  imageCount: number | null;
  missingAlt: number | null;
  wordCount: number | null;
  sentenceCount: number | null;
  fleschReadingEase: number | null;
  contentHash: string | null;
  internalLinks: number | null;
  externalLinks: number | null;
  mixedContentCount: number;
  schemaTypes: string[];
  hasSchemaPayload: boolean;
  responseTimeMs: number | null;
  bytes: number | null;
}

function comparableUrl(value: string): string {
  return value.replace(/\/$/, "");
}

/** Convert one immutable snapshot into the shared cross-report row. */
export function toCrawlSnapshotReportRow(
  snapshot: InspectionSnapshotRow,
): CrawlSnapshotReportRow {
  const head = parseSnapshotHeadTags(snapshot.head_tags);
  const headings = parseSnapshotHeadings(snapshot.headings);
  const images = parseSnapshotImages(snapshot.images);
  const links = parseSnapshotLinksSummary(snapshot.links_summary);
  const extracted = parseSnapshotExtracted(snapshot.extracted);
  const structured = parseSnapshotStructuredData(snapshot.structured_data);
  const performance = parseSnapshotPerformance(snapshot.perf);
  const seo = parseStoredSeoMetrics(snapshot.seo_metrics);
  const url = snapshot.page?.url ?? snapshot.final_url ?? snapshot.page_id;
  const canonicalState: CanonicalState = !head.canonicalUrl
    ? "missing"
    : comparableUrl(head.canonicalUrl) === comparableUrl(url)
      ? "self-referencing"
      : "canonicalized";
  const metaRobots = head.metaRobots?.toLowerCase() ?? "";

  return {
    id: snapshot.id,
    pageId: snapshot.page_id,
    url,
    capturedAt: snapshot.captured_at,
    httpStatus: snapshot.http_status,
    title: head.title,
    titleChars: seo?.title.character_count ?? null,
    titlePixels: seo?.title.pixel_width ?? null,
    titleOk: seo?.title.ok ?? null,
    metaDescription: head.metaDescription,
    descriptionChars: seo?.description.character_count ?? null,
    descriptionPixels: seo?.description.pixel_width ?? null,
    descriptionOk: seo?.description.ok ?? null,
    h1: headings.all.find((heading) => heading.level === 1)?.text ?? null,
    h1Count: headings.h1Count,
    h2Count: headings.all.filter((heading) => heading.level === 2).length,
    outline: headings.all
      .map((heading) => `H${heading.level} ${heading.text}`)
      .join(" · "),
    canonicalUrl: head.canonicalUrl,
    canonicalState,
    metaRobots: head.metaRobots,
    indexability: metaRobots.includes("noindex") ? "noindex" : "indexable",
    lang: head.lang,
    hreflangCount: head.hreflangCount,
    imageCount: images.count,
    missingAlt: images.missingAlt,
    wordCount: snapshot.word_count,
    sentenceCount: extracted.sentenceCount,
    fleschReadingEase: extracted.fleschReadingEase,
    contentHash: snapshot.content_hash,
    internalLinks: links.internal,
    externalLinks: links.external,
    mixedContentCount: extracted.mixedContentCount,
    schemaTypes: structured.schemaTypes,
    hasSchemaPayload: structured.hasPayload,
    responseTimeMs: performance.responseTimeMs,
    bytes: performance.bytes,
  };
}
