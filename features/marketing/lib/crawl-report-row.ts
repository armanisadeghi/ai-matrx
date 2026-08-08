import type { Json } from "@/types/database.types";
import { isJsonRecord } from "@/features/marketing/types";
import type {
  CrawlCanonicalQueryRow,
  InspectionSnapshotRow,
} from "@/features/marketing/data/inspection-types";
import { parseSnapshotHeadTags } from "@/features/marketing/lib/head-tags";
import {
  parseRedirectChain,
  parseSnapshotExtracted,
  parseSnapshotHeadings,
  parseSnapshotImages,
  parseSnapshotLinksSummary,
  parseSnapshotPerformance,
  parseSnapshotStructuredData,
  type SnapshotRedirectHop,
} from "@/features/marketing/lib/snapshot-content";
import { normalizeUrlForComparison } from "@/features/marketing/seo/audit/indexability";
import { parseStoredSeoMetrics } from "@/features/marketing/seo/serp/metrics";

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

// ONE canonical-match rule: `normalizeUrlForComparison` (Python-parity-tested
// in seo/audit) — the old local trailing-slash-only compare disagreed with the
// audit engine on scheme/host case and default ports.

// ---------------------------------------------------------------------------
// Redirect-chain evidence — `web.crawl_url.metadata.redirect_chain`
// ---------------------------------------------------------------------------

export type RedirectChainIssue = "loop" | "redirect-to-missing" | "chain" | null;

export interface RedirectChainSummary {
  /**
   * Whether this crawl_url row recorded hop evidence at all. `false` means
   * the crawl ran before hop capture existed (2026-08-08) — render THAT
   * honestly, never an empty chain.
   */
  recorded: boolean;
  /** Oldest hop first, final URL last. Length 1 = no redirect. */
  hops: SnapshotRedirectHop[];
  /** Number of redirects taken (hops.length - 1, floored at 0). */
  redirectCount: number;
  /** Most severe finding: loop > redirect-to-missing > chain (>= 2 redirects). */
  issue: RedirectChainIssue;
}

/**
 * Summarize one crawl_url row's persisted hop chain. `finalStatus` is the
 * row's terminal `http_status`, used to flag redirect-to-404/410 even when
 * the chain's own final hop carries no status.
 */
export function summarizeRedirectChain(
  metadata: Json,
  finalStatus: number | null,
): RedirectChainSummary {
  const recorded =
    isJsonRecord(metadata) && Array.isArray(metadata.redirect_chain);
  const hops = recorded
    ? parseRedirectChain((metadata as { redirect_chain: Json }).redirect_chain)
    : [];
  const redirectCount = Math.max(0, hops.length - 1);
  let issue: RedirectChainIssue = null;
  if (redirectCount >= 1) {
    // Loop detection must keep the PATH exact — `/a` → `/a/` is the single
    // most common legitimate redirect, and the slash-stripping canonical
    // normalizer would call it a loop. Only scheme+host are case-folded.
    const seen = new Set<string>();
    let hasLoop = false;
    for (const hop of hops) {
      const key = redirectHopKey(hop.url);
      if (seen.has(key)) {
        hasLoop = true;
        break;
      }
      seen.add(key);
    }
    const terminal = finalStatus ?? hops[hops.length - 1]?.status ?? null;
    if (hasLoop) issue = "loop";
    else if (terminal === 404 || terminal === 410) issue = "redirect-to-missing";
    else if (redirectCount >= 2) issue = "chain";
  }
  return { recorded, hops, redirectCount, issue };
}

function redirectHopKey(url: string): string {
  try {
    const parsed = new URL(url.trim());
    return `${parsed.protocol.toLowerCase()}//${parsed.hostname.toLowerCase()}${
      parsed.port ? `:${parsed.port}` : ""
    }${parsed.pathname}${parsed.search}`;
  } catch {
    return url.trim();
  }
}

// ---------------------------------------------------------------------------
// Canonical-chain resolution — session-wide observed-canonical walk
// ---------------------------------------------------------------------------

export interface CanonicalTargetEntry {
  url: string;
  canonicalUrl: string | null;
  httpStatus: number | null;
}

export type CanonicalLookup = Map<string, CanonicalTargetEntry>;

/**
 * Index one session's observed canonicals by comparable URL. Both the page's
 * canonical URL and the snapshot's fetched `final_url` key the same entry so
 * author-written canonical targets resolve regardless of which one they name.
 */
export function buildCanonicalLookup(
  rows: CrawlCanonicalQueryRow[],
): CanonicalLookup {
  const lookup: CanonicalLookup = new Map();
  for (const row of rows) {
    const url = row.page?.url ?? row.final_url;
    if (!url) continue;
    const canonicalUrl =
      typeof row.canonical_url === "string" && row.canonical_url.trim()
        ? row.canonical_url.trim()
        : null;
    const entry: CanonicalTargetEntry = {
      url,
      canonicalUrl,
      httpStatus: row.http_status,
    };
    for (const key of new Set(
      [url, row.final_url].flatMap((value) =>
        value ? [normalizeUrlForComparison(value)] : [],
      ),
    )) {
      if (!lookup.has(key)) lookup.set(key, entry);
    }
  }
  return lookup;
}

export type CanonicalChainState =
  /** Canonical points at a page that IS canonical (self or no declaration). */
  | "canonicalized"
  /** Canonical points at a NON-canonical page — A → B → C (chain). */
  | "chain"
  /** The canonical walk returns to an already-visited URL. */
  | "loop"
  /** Canonical target answered 4xx/5xx in this crawl. */
  | "canonical-to-error"
  /** Canonical target was not captured in this session — unknown, said honestly. */
  | "target-not-crawled";

export interface CanonicalChainEvaluation {
  state: CanonicalChainState;
  /** Full observed path starting at the page itself (A → B → C…). */
  path: string[];
  /** HTTP status of the direct canonical target, when captured. */
  targetStatus: number | null;
  /** The direct target's OWN canonical when it differs from the target. */
  targetCanonicalUrl: string | null;
}

const CANONICAL_WALK_CAP = 10;

/**
 * Walk the observed canonical graph from one canonicalized page. Only called
 * for rows whose `canonicalState` is `"canonicalized"` — self-referencing and
 * missing rows have no chain to resolve. Returns the most severe finding on
 * the walk; every conclusion is backed by same-session snapshot evidence.
 */
export function evaluateCanonicalChain(
  row: { url: string; canonicalUrl: string },
  lookup: CanonicalLookup,
): CanonicalChainEvaluation {
  const path = [row.url, row.canonicalUrl];
  const seen = new Set<string>([normalizeUrlForComparison(row.url)]);
  let currentUrl = row.canonicalUrl;
  const direct = lookup.get(normalizeUrlForComparison(row.canonicalUrl)) ?? null;
  const targetStatus = direct?.httpStatus ?? null;
  const targetCanonicalUrl =
    direct?.canonicalUrl &&
    normalizeUrlForComparison(direct.canonicalUrl) !==
      normalizeUrlForComparison(direct.url)
      ? direct.canonicalUrl
      : null;
  let sawChain = false;
  for (let step = 0; step < CANONICAL_WALK_CAP; step += 1) {
    const key = normalizeUrlForComparison(currentUrl);
    if (seen.has(key)) {
      return { state: "loop", path, targetStatus, targetCanonicalUrl };
    }
    seen.add(key);
    const entry = lookup.get(key);
    if (!entry) {
      // The direct target being uncaptured is an honest unknown; an
      // uncaptured DEEPER hop still proves a chain exists.
      return {
        state: sawChain ? "chain" : "target-not-crawled",
        path,
        targetStatus,
        targetCanonicalUrl,
      };
    }
    if (entry.httpStatus !== null && entry.httpStatus >= 400) {
      return { state: "canonical-to-error", path, targetStatus, targetCanonicalUrl };
    }
    const next = entry.canonicalUrl;
    if (
      !next ||
      normalizeUrlForComparison(next) === normalizeUrlForComparison(entry.url)
    ) {
      return {
        state: sawChain ? "chain" : "canonicalized",
        path,
        targetStatus,
        targetCanonicalUrl,
      };
    }
    sawChain = true;
    path.push(next);
    currentUrl = next;
  }
  return { state: "chain", path, targetStatus, targetCanonicalUrl };
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
    : normalizeUrlForComparison(head.canonicalUrl) ===
        normalizeUrlForComparison(url)
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
