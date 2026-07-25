/**
 * Runtime scope assembly for the `matrx-user/marketing-page` surface.
 *
 * Converts a loaded PageWorkspace payload into the typed ApplicationScope the
 * surface declares (features/surfaces/manifests/marketing-page.manifest.ts).
 * This is THE handoff point for the marketing agent fleet: any launcher on the
 * page workspace passes
 *
 *   runtime: {
 *     surfaceName: "matrx-user/marketing-page",
 *     applicationScope: buildMarketingPageScope({ brandId, page, snapshot, ... }),
 *   }
 *
 * to `launchAgentExecution`.
 *
 * COMPLETENESS LAW: every piece of data the workspace loads is emitted here as
 * a declared surface value. The deterministic evaluations (indexability,
 * social card, URL quality) are computed by the SAME exported helpers the UI
 * renders from — one evaluation path, two consumers.
 */

import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { MarketingSiteBaseValues } from "@/features/marketing/lib/scopes/site-surface-base";
import {
  createMarketingPageScope,
  type MarketingPageCaptureEntry,
} from "@/features/surfaces/manifests/marketing-page.manifest";
import { parseSnapshotHeadTags } from "@/features/marketing/lib/head-tags";
import {
  parseSnapshotExtracted,
  parseSnapshotHeadings,
  parseSnapshotImages,
  parseSnapshotLinksSummary,
} from "@/features/marketing/lib/snapshot-content";
import { parseStoredSeoMetrics } from "@/features/marketing/seo/serp/metrics";
import { parseStoredAuditMetrics, socialInputFromRawTags } from "@/features/marketing/seo/audit/stored";
import {
  evaluateIndexability,
  type IndexabilityEvaluation,
} from "@/features/marketing/seo/audit/indexability";
import {
  evaluateSocialCard,
  type SocialCardEvaluation,
} from "@/features/marketing/seo/audit/social";
import { evaluateUrlQuality } from "@/features/marketing/seo/audit/url-quality";
import type { PageAnalysisArtifact } from "@/features/marketing/components/pages/usePageAnalyzer";
import type { PagePerformanceRow } from "@/features/marketing/pagespeed/data";
import type { WebAnalyticsDailyRow } from "@/features/marketing/analytics/data";
import {
  isJsonRecord,
  type MarketingPage,
  type PageSitemapMembershipRow,
  type PageSnapshot,
  type SiteScreenshot,
} from "@/features/marketing/types";

export const MARKETING_PAGE_SURFACE_NAME = "matrx-user/marketing-page" as const;

/**
 * Deterministic indexability verdict for the page's latest snapshot —
 * identical to the scraper's crawl-time `audit_metrics.indexability` by
 * construction. THE one evaluation both the UI and the surface scope use.
 */
export function evaluatePageIndexability(
  page: MarketingPage,
  snapshot: PageSnapshot,
): IndexabilityEvaluation {
  const head = parseSnapshotHeadTags(snapshot.head_tags);
  const extracted = parseSnapshotExtracted(snapshot.extracted);
  return evaluateIndexability({
    httpStatus: snapshot.http_status,
    metaRobots: head.metaRobots,
    canonicalUrl: head.canonicalUrl,
    redirectChain: extracted.redirectChain,
    finalUrl: snapshot.final_url ?? page.url,
  });
}

/** Raw og/twitter tag records from `head_tags` — the evaluator's wire shape. */
export function rawSocialTags(snapshot: PageSnapshot): {
  og: Record<string, unknown>;
  twitter: Record<string, unknown>;
} {
  const headTags = isJsonRecord(snapshot.head_tags) ? snapshot.head_tags : {};
  return {
    og: isJsonRecord(headTags.og) ? headTags.og : {},
    twitter: isJsonRecord(headTags.twitter) ? headTags.twitter : {},
  };
}

/**
 * Deterministic social-card evaluation of the snapshot's observed share tags
 * (exact parity with the scraper's `audit_metrics.social`). THE one
 * evaluation both the UI and the surface scope use.
 */
export function evaluatePageSocialCard(
  snapshot: PageSnapshot,
): SocialCardEvaluation {
  const raw = rawSocialTags(snapshot);
  return evaluateSocialCard(socialInputFromRawTags(raw.og, raw.twitter));
}

/** Capture rows with a stored file, exactly as the Captures card renders them. */
export function pageCaptureRows(
  rows: readonly SiteScreenshot[] | null | undefined,
): (SiteScreenshot & { file_id: string })[] {
  return (rows ?? []).filter(
    (screenshot): screenshot is SiteScreenshot & { file_id: string } =>
      Boolean(screenshot.file_id),
  );
}

/** Desktop/mobile availability flags — one classification, UI + scope. */
export function captureAvailability(rows: readonly SiteScreenshot[]): {
  hasDesktopCapture: boolean;
  hasMobileCapture: boolean;
} {
  const isMobile = (screenshot: SiteScreenshot) =>
    screenshot.kind.toLowerCase().includes("mobile") ||
    (screenshot.width !== null && screenshot.width <= 600);
  return {
    hasMobileCapture: rows.some(isMobile),
    hasDesktopCapture: rows.some((screenshot) => !isMobile(screenshot)),
  };
}

/** Latest persisted PageSpeed row per strategy (rows arrive newest-first). */
export function latestPagespeedByStrategy(
  rows: readonly PagePerformanceRow[] | null | undefined,
): Map<string, PagePerformanceRow> {
  const latest = new Map<string, PagePerformanceRow>();
  for (const row of rows ?? []) {
    if (!latest.has(row.strategy)) latest.set(row.strategy, row);
  }
  return latest;
}

/** GA4 landing-page totals over the stored window — one math, UI + scope. */
export function webAnalyticsTotals(
  rows: readonly WebAnalyticsDailyRow[] | null | undefined,
): {
  sessions: number;
  users: number;
  engagedSessions: number;
  engagementRate: number | null;
} {
  const totals = (rows ?? []).reduce(
    (acc, row) => ({
      sessions: acc.sessions + row.sessions,
      users: acc.users + row.users,
      engagedSessions: acc.engagedSessions + row.engaged_sessions,
    }),
    { sessions: 0, users: 0, engagedSessions: 0 },
  );
  return {
    ...totals,
    engagementRate:
      totals.sessions > 0
        ? (totals.engagedSessions / totals.sessions) * 100
        : null,
  };
}

export function buildMarketingPageScope(input: {
  brandId: string;
  page: MarketingPage;
  snapshot: PageSnapshot | null;
  openFindings?: number;
  selection?: string;
  /**
   * The FULL extracted markdown of the latest snapshot (the page's actual
   * body content). Pass whenever loaded — this is the primary payload for
   * content agents (`page_content` + baseline `content`).
   */
  markdown?: string | null;
  /** Rolling 28-day GSC evidence for this page, when loaded. */
  gscMetrics?: {
    clicks: number;
    impressions: number;
    ctr?: number | null;
    position?: number | null;
  } | null;
  /** Screenshot rows for this page (usePageScreenshots), when loaded. */
  screenshots?: readonly SiteScreenshot[] | null;
  /** Page Analyzer artifact from this session's run, when available. */
  analyzerArtifact?: PageAnalysisArtifact | null;
  /** Persisted PageSpeed rows for this page, when loaded. */
  pagespeedRows?: readonly PagePerformanceRow[] | null;
  /** Stored GA4 landing-page rows for this page, when loaded. */
  analyticsRows?: readonly WebAnalyticsDailyRow[] | null;
  /** Sitemap membership rows for this page, when loaded. */
  sitemapMemberships?: readonly PageSitemapMembershipRow[] | null;
  /** `v_page_score.page_score`, when the page has been scored. */
  pageScore?: number | null;
  /** `v_page_score.fail_count`. */
  failedChecks?: number | null;
  /**
   * Inherited site-level base values (brand/site identity + XML context) from
   * `useMarketingSiteSurfaceBase().getBaseValues()`. Spread first — the
   * page-specific values below always win on overlap (brand_id / site_id).
   */
  base?: MarketingSiteBaseValues;
}): SurfaceScopePayload {
  const {
    brandId,
    page,
    snapshot,
    openFindings,
    selection,
    markdown,
    gscMetrics,
    screenshots,
    analyzerArtifact,
    pagespeedRows,
    analyticsRows,
    sitemapMemberships,
    pageScore,
    failedChecks,
    base,
  } = input;
  const headings = snapshot ? parseSnapshotHeadings(snapshot.headings).all : [];
  const head = snapshot ? parseSnapshotHeadTags(snapshot.head_tags) : null;
  const extracted = snapshot ? parseSnapshotExtracted(snapshot.extracted) : null;
  const observedMetrics = snapshot
    ? parseStoredSeoMetrics(snapshot.seo_metrics)
    : null;
  const desiredMetrics = parseStoredSeoMetrics(page.seo_metrics_desired);

  // Composite intent — mirrors the individual page-intent values; omitted
  // entirely when the user has set none of them.
  const hasIntent = Boolean(
    page.target_keyword ||
      page.meta_title_desired ||
      page.meta_description_desired ||
      desiredMetrics,
  );
  const pageIntent = hasIntent
    ? {
        target_keyword: page.target_keyword,
        desired_title: page.meta_title_desired,
        desired_description: page.meta_description_desired,
        desired_seo_metrics: desiredMetrics ?? null,
      }
    : undefined;

  // Deterministic evaluations — the same helpers the UI renders from.
  const indexabilityEval = snapshot
    ? evaluatePageIndexability(page, snapshot)
    : null;
  const indexability =
    snapshot && head && extracted && indexabilityEval
      ? {
          verdict: indexabilityEval.verdict,
          meta_robots: head.metaRobots,
          canonical_url: head.canonicalUrl,
          redirect_chain: extracted.redirectChain,
          final_url: snapshot.final_url ?? page.url,
          language: head.lang,
          issues: indexabilityEval.issues,
        }
      : undefined;
  const socialEval = snapshot ? evaluatePageSocialCard(snapshot) : null;
  const socialCard =
    snapshot && head && socialEval
      ? {
          og: head.og,
          twitter: head.twitter,
          title: socialEval.title,
          description: socialEval.description,
          image: socialEval.image,
          card_type: socialEval.cardType,
          og_type: socialEval.ogType,
          issues: socialEval.issues,
        }
      : undefined;
  const urlQuality = evaluateUrlQuality(page.url);

  const links = snapshot
    ? parseSnapshotLinksSummary(snapshot.links_summary)
    : null;
  const images = snapshot ? parseSnapshotImages(snapshot.images) : null;
  const contentStats =
    snapshot && extracted && links && images
      ? {
          sentence_count: extracted.sentenceCount,
          flesch_reading_ease: extracted.fleschReadingEase,
          links_total: links.total,
          links_internal: links.internal,
          links_external: links.external,
          images_count: images.count,
          images_missing_alt: images.missingAlt,
        }
      : undefined;
  const contentFileIds = snapshot
    ? {
        body_file_id: snapshot.body_file_id,
        markdown_file_id: snapshot.markdown_file_id,
      }
    : undefined;

  const captureRows = screenshots ? pageCaptureRows(screenshots) : null;
  const captures: MarketingPageCaptureEntry[] | undefined = captureRows
    ? captureRows.map((row) => ({
        kind: row.kind,
        file_id: row.file_id,
        captured_at: row.captured_at,
        width: row.width,
        height: row.height,
        snapshot_id: row.snapshot_id,
      }))
    : undefined;
  const availability = captureRows ? captureAvailability(captureRows) : null;

  const pagespeedLatest = latestPagespeedByStrategy(pagespeedRows);
  const pagespeed =
    pagespeedLatest.size > 0
      ? Object.fromEntries(
          [...pagespeedLatest.entries()].map(([strategy, row]) => {
            const metrics = row.lighthouse?.metrics ?? {};
            return [
              strategy,
              {
                performance_score: row.performance_score,
                accessibility_score: row.accessibility_score,
                best_practices_score: row.best_practices_score,
                seo_score: row.seo_score,
                lcp_ms: metrics.lcp_ms?.numeric_value ?? null,
                cls: metrics.cls?.numeric_value ?? null,
                inp_ms: metrics.inp_ms?.numeric_value ?? null,
                crux_field_category:
                  row.crux?.page?.overall_category ??
                  row.crux?.origin?.overall_category ??
                  null,
                observed_at: row.observed_at,
              },
            ];
          }),
        )
      : undefined;

  const ga4 =
    analyticsRows && analyticsRows.length > 0
      ? (() => {
          const totals = webAnalyticsTotals(analyticsRows);
          return {
            sessions: totals.sessions,
            users: totals.users,
            engaged_sessions: totals.engagedSessions,
            engagement_rate: totals.engagementRate,
          };
        })()
      : undefined;

  const memberships =
    sitemapMemberships && sitemapMemberships.length > 0
      ? sitemapMemberships.map((membership) => ({
          sitemap_url: membership.sitemap.url,
          lastmod: membership.lastmod,
          last_seen: membership.last_seen,
        }))
      : undefined;

  return createMarketingPageScope({
    ...base,
    page_id: page.id,
    site_id: page.site_id,
    brand_id: brandId,
    page_url: page.url,
    page_path: page.path || "/",
    page_status: page.status ?? undefined,
    page_provenance: page.provenance ?? undefined,
    first_seen: page.first_seen ?? undefined,
    last_seen: page.last_seen ?? undefined,
    target_keyword: page.target_keyword ?? undefined,
    observed_title: head?.title ?? undefined,
    observed_description: head?.metaDescription ?? undefined,
    observed_seo_metrics: observedMetrics ?? undefined,
    observed_audit_metrics: snapshot
      ? (parseStoredAuditMetrics(snapshot.audit_metrics) ?? undefined)
      : undefined,
    snapshot_captured_at: snapshot?.captured_at ?? undefined,
    word_count: snapshot?.word_count ?? undefined,
    desired_title: page.meta_title_desired ?? undefined,
    desired_description: page.meta_description_desired ?? undefined,
    desired_seo_metrics: desiredMetrics ?? undefined,
    page_intent: pageIntent,
    indexability,
    social_card: socialCard,
    url_quality_issues:
      urlQuality.issues.length > 0
        ? urlQuality.issues.map((issue) => ({ ...issue }))
        : undefined,
    page_content: markdown ?? undefined,
    content: markdown ?? undefined,
    headings_outline: headings.length > 0 ? headings : undefined,
    content_stats: contentStats,
    content_file_ids: contentFileIds,
    captures,
    has_desktop_capture: availability?.hasDesktopCapture,
    has_mobile_capture: availability?.hasMobileCapture,
    gsc_metrics_28d: gscMetrics ?? undefined,
    pagespeed,
    ga4_metrics: ga4,
    sitemap_memberships: memberships,
    open_findings: openFindings,
    page_analyzer: analyzerArtifact
      ? {
          inferred_primary_keyword: analyzerArtifact.inferred_primary_keyword,
          supported_keywords: analyzerArtifact.supported_keywords,
          discovered_keywords: analyzerArtifact.discovered_keywords,
          content_role: analyzerArtifact.content_role,
          funnel_position: analyzerArtifact.funnel_position,
          declared_vs_actual: analyzerArtifact.declared_vs_actual,
          gaps: analyzerArtifact.gaps,
          cannibalization_risk: analyzerArtifact.cannibalization_risk,
          analyzer_version: analyzerArtifact.analyzer_version,
        }
      : undefined,
    page_score: pageScore ?? undefined,
    failed_checks: failedChecks ?? undefined,
    http_status: page.http_status_last ?? undefined,
    selection,
  });
}
