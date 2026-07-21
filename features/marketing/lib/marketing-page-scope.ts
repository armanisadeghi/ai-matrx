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
import { createMarketingPageScope } from "@/features/surfaces/manifests/marketing-page.manifest";
import { parseSnapshotHeadTags } from "@/features/marketing/lib/head-tags";
import { parseStoredSeoMetrics } from "@/features/seo/serp/metrics";
import type { MarketingPage, PageSnapshot } from "@/features/marketing/types";

export const MARKETING_PAGE_SURFACE_NAME = "matrx-user/marketing-page" as const;

export function buildMarketingPageScope(input: {
  brandId: string;
  page: MarketingPage;
  snapshot: PageSnapshot | null;
  openFindings?: number;
  selection?: string;
}): SurfaceScopePayload {
  const { brandId, page, snapshot, openFindings, selection } = input;
  const head = snapshot ? parseSnapshotHeadTags(snapshot.head_tags) : null;
  const observedMetrics = snapshot
    ? parseStoredSeoMetrics(snapshot.seo_metrics)
    : null;
  const desiredMetrics = parseStoredSeoMetrics(page.seo_metrics_desired);

  return createMarketingPageScope({
    page_id: page.id,
    site_id: page.site_id,
    brand_id: brandId,
    page_url: page.url,
    target_keyword: page.target_keyword ?? undefined,
    observed_title: head?.title ?? undefined,
    observed_description: head?.metaDescription ?? undefined,
    observed_seo_metrics: observedMetrics ?? undefined,
    snapshot_captured_at: snapshot?.captured_at ?? undefined,
    word_count: snapshot?.word_count ?? undefined,
    desired_title: page.meta_title_desired ?? undefined,
    desired_description: page.meta_description_desired ?? undefined,
    desired_seo_metrics: desiredMetrics ?? undefined,
    open_findings: openFindings,
    http_status: page.http_status_last ?? undefined,
    selection,
  });
}
