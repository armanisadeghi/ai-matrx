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
 *     applicationScope: buildMarketingPageScope({ brandId, page, snapshot, openFindings }),
 *   }
 *
 * to `launchAgentExecution`. No agent-launch UI exists on the workspace yet
 * (the AI layer is deliberately staged — see the manifest's agentRoles); when
 * it lands, it consumes this builder instead of assembling values ad hoc.
 */

import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { MarketingSiteBaseValues } from "@/features/marketing/lib/scopes/site-surface-base";
import { createMarketingPageScope } from "@/features/surfaces/manifests/marketing-page.manifest";
import { parseSnapshotHeadTags } from "@/features/marketing/lib/head-tags";
import { parseSnapshotHeadings } from "@/features/marketing/lib/snapshot-content";
import { parseStoredSeoMetrics } from "@/features/seo/serp/metrics";
import { parseStoredAuditMetrics } from "@/features/seo/audit/stored";
import type { MarketingPage, PageSnapshot } from "@/features/marketing/types";

export const MARKETING_PAGE_SURFACE_NAME = "matrx-user/marketing-page" as const;

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
    base,
  } = input;
  const headings = snapshot ? parseSnapshotHeadings(snapshot.headings).all : [];
  const head = snapshot ? parseSnapshotHeadTags(snapshot.head_tags) : null;
  const observedMetrics = snapshot
    ? parseStoredSeoMetrics(snapshot.seo_metrics)
    : null;
  const desiredMetrics = parseStoredSeoMetrics(page.seo_metrics_desired);

  return createMarketingPageScope({
    ...base,
    page_id: page.id,
    site_id: page.site_id,
    brand_id: brandId,
    page_url: page.url,
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
    page_content: markdown ?? undefined,
    content: markdown ?? undefined,
    headings_outline: headings.length > 0 ? headings : undefined,
    gsc_metrics_28d: gscMetrics ?? undefined,
    open_findings: openFindings,
    http_status: page.http_status_last ?? undefined,
    selection,
  });
}
