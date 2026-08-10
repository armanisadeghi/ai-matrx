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
  parseSnapshotPageIdentity,
  parseSnapshotResources,
} from "@/features/marketing/lib/snapshot-content";
import { parseStoredSeoMetrics } from "@/features/marketing/seo/serp/metrics";
import {
  parseStoredAuditMetrics,
  socialInputFromRawTags,
} from "@/features/marketing/seo/audit/stored";
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
import {
  acceptedAnchorTextsFromDesiredValues,
  acceptedAnchorsByTargetUrl,
  inboundPlanObservations,
  outboundPlanObservations,
  plannedLinksFromDesiredValues,
  scorePlannedLinks,
  summarizePlannedLinkScores,
  type InboundLinkEdge,
  type OutboundLinkEdge,
  type PlannedLinkScore,
} from "@/features/marketing/data/page-links";
import {
  buildSnapshotMediaAssets,
  bucketSnapshotAssets,
} from "@/features/marketing/lib/snapshot-media";
import type { PagePerformanceResponse } from "@/features/marketing/pagespeed/data";
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
  /** Canonical combined PSI history/regressions + GSC read, when loaded. */
  pagePerformance?: PagePerformanceResponse | null;
  /** Stored GA4 landing-page rows for this page, when loaded. */
  analyticsRows?: readonly WebAnalyticsDailyRow[] | null;
  /** Sitemap membership rows for this page, when loaded. */
  sitemapMemberships?: readonly PageSitemapMembershipRow[] | null;
  /** `v_page_score.page_score`, when the page has been scored. */
  pageScore?: number | null;
  /** `v_page_score.fail_count`. */
  failedChecks?: number | null;
  /**
   * Condensed keyword dossier for the saved target keyword
   * (`buildKeywordBrief(...).data` — market metrics + classification), when
   * the phrase resolved against the keyword library. Agents get the DATA,
   * never just the phrase.
   */
  targetKeywordData?: Record<string, unknown> | null;
  /** The authored draft body (`web.page_content.content`), when loaded. */
  draftContent?: string | null;
  /** The attached keyword batch rows (page-keywords board), when loaded. */
  keywordBatch?: readonly Record<string, unknown>[] | null;
  /** Open findings rows as listed on the workspace, when loaded. */
  findingsRows?: readonly Record<string, unknown>[] | null;
  /** Per-query GSC breakdown rows for the default 28-day window
   * (usePageQueryStats), when loaded. */
  gscQueries?: readonly Record<string, unknown>[] | null;
  /** The target-keyword performance evidence bundle
   * (PageTargetPerformanceCard's resolved query, read from the shared
   * react-query cache — no duplicate fetch), when the pane has resolved. */
  targetPerformance?: Record<string, unknown> | null;
  /** Inbound / outbound internal-link rows, when loaded. */
  inboundLinks?: readonly InboundLinkEdge[] | null;
  outboundLinks?: readonly OutboundLinkEdge[] | null;
  /**
   * The Plan → CMS bridge summary (`summarizeCmsPushFacts` over the Push to
   * CMS card's react-query cache entry), when the card has resolved.
   */
  cmsPush?: Record<string, unknown> | null;
  /** Backlink evidence bundle, when loaded. */
  backlinks?: Record<string, unknown> | null;
  /** Tasks associated with this page, when loaded. */
  pageTasks?: readonly Record<string, unknown>[] | null;
  /** Association-edge counts per entity type, when loaded. */
  attachedItems?: Record<string, unknown> | null;
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
    pagePerformance,
    analyticsRows,
    sitemapMemberships,
    pageScore,
    failedChecks,
    targetKeywordData,
    draftContent,
    keywordBatch,
    findingsRows,
    gscQueries,
    targetPerformance,
    inboundLinks,
    outboundLinks,
    cmsPush,
    backlinks,
    pageTasks,
    attachedItems,
    base,
  } = input;
  const desiredValues = isJsonRecord(page.desired_values)
    ? (page.desired_values as Record<string, unknown>)
    : null;
  const imagePlan =
    desiredValues && Array.isArray(desiredValues.image_plan)
      ? (desiredValues.image_plan as Array<Record<string, unknown>>)
      : null;
  const headings = snapshot ? parseSnapshotHeadings(snapshot.headings).all : [];
  const head = snapshot ? parseSnapshotHeadTags(snapshot.head_tags) : null;
  const extracted = snapshot
    ? parseSnapshotExtracted(snapshot.extracted)
    : null;
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
  const pageIdentity = snapshot
    ? parseSnapshotPageIdentity(snapshot.extracted, snapshot.structured_data)
    : null;
  const resources = snapshot
    ? parseSnapshotResources(snapshot.extracted)
    : null;
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

  const pagespeed = pagePerformance?.has_psi_data
    ? {
        mobile: pagePerformance.psi_mobile ?? undefined,
        desktop: pagePerformance.psi_desktop ?? undefined,
        history: pagePerformance.psi_history ?? [],
        regressions: pagePerformance.regressions ?? [],
      }
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

  // The authored link plan, scored live against the observed edges — the same
  // pure scoring helpers LinksPlanCard renders from (one evaluation path, two
  // consumers). Outbound target policies come from the observed edges' target
  // pages (the card additionally consults the site directory for unlinked
  // targets; the scope stays evidence-only).
  const acceptedAnchors = acceptedAnchorTextsFromDesiredValues(
    page.desired_values,
  );
  const inboundPlanEntries = plannedLinksFromDesiredValues(
    page.desired_values,
    "inbound_links",
  );
  const outboundPlanEntries = plannedLinksFromDesiredValues(
    page.desired_values,
    "outbound_links",
  );
  const planScoreEntry = (score: PlannedLinkScore) => ({
    url: score.entry.url,
    anchor_text: score.entry.anchor_text ?? null,
    status: score.status,
    observed_anchors: score.observedAnchors,
    observed_edge_count: score.observedEdgeCount,
    acceptable_anchors: score.acceptableAnchors,
  });
  let linkPlan: Record<string, unknown> | undefined;
  if (
    acceptedAnchors.length > 0 ||
    inboundPlanEntries.length > 0 ||
    outboundPlanEntries.length > 0
  ) {
    const inboundScores = scorePlannedLinks(
      inboundPlanEntries,
      inboundPlanObservations([...(inboundLinks ?? [])]),
      () => acceptedAnchors,
    );
    const observedPolicies = acceptedAnchorsByTargetUrl([
      ...(outboundLinks ?? []),
    ]);
    const outboundScores = scorePlannedLinks(
      outboundPlanEntries,
      outboundPlanObservations([...(outboundLinks ?? [])]),
      (normalizedUrl) => observedPolicies.get(normalizedUrl) ?? [],
    );
    linkPlan = {
      accepted_anchor_texts: acceptedAnchors,
      inbound: {
        summary: summarizePlannedLinkScores(inboundScores),
        entries: inboundScores.map(planScoreEntry),
      },
      outbound: {
        summary: summarizePlannedLinkScores(outboundScores),
        entries: outboundScores.map(planScoreEntry),
      },
    };
  }

  // Categorized media picture — same core the Page Media card renders from,
  // bounded for context (the raw `images` inventory rides separately).
  const MEDIA_ASSET_CAP = 60;
  const mediaAssets =
    images && images.items.length > 0
      ? buildSnapshotMediaAssets(
          images.items.map((image) => ({ image, page: null })),
        )
      : null;
  const mediaInventory =
    mediaAssets && mediaAssets.assets.length > 0
      ? (() => {
          const buckets = bucketSnapshotAssets(mediaAssets.assets);
          return {
            total: mediaAssets.assets.length,
            missing_alt: mediaAssets.assets.filter((asset) => asset.missingAlt)
              .length,
            without_src: mediaAssets.withoutSrc,
            counts: {
              landscape: buckets.landscape.length,
              square: buckets.square.length,
              portrait: buckets.portrait.length,
              unknown_aspect: buckets.unknownAspect.length,
              graphics: buckets.graphics.length,
              icons: buckets.icons.length,
            },
            assets: mediaAssets.assets
              .slice(0, MEDIA_ASSET_CAP)
              .map((asset) => ({
                src: asset.src,
                alt: asset.alt,
                missing_alt: asset.missingAlt,
                featured: asset.featured,
                tier: asset.tier,
                aspect: asset.aspect,
                size: asset.sizeLabel,
                occurrences: asset.occurrences,
              })),
            truncated: mediaAssets.assets.length > MEDIA_ASSET_CAP,
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
    target_keyword_data: targetKeywordData ?? undefined,
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
    target_performance: targetPerformance ?? undefined,
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
    structured_data: snapshot
      ? ((snapshot.structured_data ?? undefined) as
          Record<string, unknown> | undefined)
      : undefined,
    page_identity: pageIdentity
      ? {
          featured_image: pageIdentity.featuredImage,
          featured_image_source: pageIdentity.featuredImageSource,
          cms: pageIdentity.cms,
          generator: pageIdentity.generator,
          application_name: pageIdentity.applicationName,
          site_name: pageIdentity.siteName,
          author: pageIdentity.author,
          published_at: pageIdentity.publishedAt,
          modified_at: pageIdentity.modifiedAt,
          page_types: pageIdentity.pageTypes,
          theme_color: pageIdentity.themeColor,
          html_lang: pageIdentity.htmlLang,
          locale: pageIdentity.locale,
          content_section: pageIdentity.contentSection,
          shortlink: pageIdentity.shortlink,
          amp_url: pageIdentity.ampUrl,
          manifest_url: pageIdentity.manifestUrl,
          api_urls: pageIdentity.apiUrls,
          feed_urls: pageIdentity.feedUrls,
          body_classes: pageIdentity.bodyClasses,
          platform_signals: pageIdentity.platformSignals,
          platform_details: pageIdentity.platformDetails,
        }
      : undefined,
    resources:
      resources && (resources.count > 0 || resources.items.length > 0)
        ? {
            count: resources.count,
            counts: resources.counts,
            items: resources.items,
            truncated: resources.truncated,
          }
        : undefined,
    perf: snapshot
      ? ((snapshot.perf ?? undefined) as Record<string, unknown> | undefined)
      : undefined,
    images: snapshot
      ? ((snapshot.images ?? undefined) as Record<string, unknown> | undefined)
      : undefined,
    desired_values:
      desiredValues && Object.keys(desiredValues).length > 0
        ? desiredValues
        : undefined,
    link_plan: linkPlan,
    media_inventory: mediaInventory,
    cms_push: cmsPush ?? undefined,
    draft_content: draftContent || undefined,
    keyword_batch:
      keywordBatch && keywordBatch.length > 0 ? [...keywordBatch] : undefined,
    image_plan: imagePlan && imagePlan.length > 0 ? imagePlan : undefined,
    findings:
      findingsRows && findingsRows.length > 0 ? [...findingsRows] : undefined,
    gsc_queries:
      gscQueries && gscQueries.length > 0 ? [...gscQueries] : undefined,
    inbound_links:
      inboundLinks && inboundLinks.length > 0 ? [...inboundLinks] : undefined,
    outbound_links:
      outboundLinks && outboundLinks.length > 0
        ? [...outboundLinks]
        : undefined,
    backlinks: backlinks ?? undefined,
    page_tasks: pageTasks && pageTasks.length > 0 ? [...pageTasks] : undefined,
    attached_items: attachedItems ?? undefined,
    selection,
  });
}
