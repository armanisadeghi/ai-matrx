"use client";

/**
 * site-link-compliance — the SITE-level view over the two-plan internal-link
 * contract: every page that declared an anchor policy
 * (`desired_values.accepted_anchor_texts`) or a link plan
 * (`desired_values.inbound_links` / `desired_values.outbound_links`) gets
 * every OTHER page's current links scored against it.
 *
 * Two bounded direct reads (pages directory + raw link edges), then one pure
 * client-side aggregation. Caps are loud: the report carries `truncated`
 * flags and the view must render them. Only edges from each source page's
 * latest accepted snapshot count — historical crawl rows never inflate
 * compliance (same law as the page-level card).
 */

import { useQuery } from "@tanstack/react-query";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { assertData } from "@/features/marketing/data/service";
import {
  acceptedAnchorTextsFromDesiredValues,
  anchorComplianceStatus,
  normalizePlanUrl,
  plannedLinksFromDesiredValues,
  scorePlannedLinks,
  summarizePlannedLinkScores,
  type PlannedLinkObservation,
  type PlannedLinkPlanSummary,
  type PlannedLinkScore,
} from "@/features/marketing/data/page-links";
import { supabase } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";
import type { Json } from "@/types/database.types";

export const LINK_PLAN_PAGE_CAP = 2000;
export const LINK_PLAN_EDGE_CAP = 5000;
const FETCH_PAGE_SIZE = 1000;

export interface SitePagePlanRow {
  id: string;
  url: string;
  path: string | null;
  latest_snapshot_id: string | null;
  desired_values: Json;
}

export interface SitePagePlanResult {
  rows: SitePagePlanRow[];
  truncated: boolean;
}

/**
 * The site pages directory for plan work: id + url + the desired_values
 * slices. Bounded and paged; ordered deterministically so a truncated fetch
 * is stable.
 */
export async function listSitePagePlanRows(
  siteId: string,
  signal?: AbortSignal,
): Promise<SitePagePlanResult> {
  const db = await authenticatedWebDb(supabase);
  const abortSignal = signal ?? new AbortController().signal;
  const rows: SitePagePlanRow[] = [];
  for (let from = 0; from < LINK_PLAN_PAGE_CAP; from += FETCH_PAGE_SIZE) {
    const to = Math.min(from + FETCH_PAGE_SIZE, LINK_PLAN_PAGE_CAP) - 1;
    const response = await db
      .from("page")
      .select("id, url, path, latest_snapshot_id, desired_values")
      .eq("site_id", siteId)
      .is("deleted_at", null)
      .order("url", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
      .abortSignal(abortSignal);
    const page = assertData(response.data, response.error);
    rows.push(...page);
    if (page.length < FETCH_PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

export function useSitePagePlanRows(siteId: string, enabled = true) {
  return useQuery({
    queryKey: [...marketingKeys.site(siteId), "link-plan-pages"] as const,
    queryFn: ({ signal }) => listSitePagePlanRows(siteId, signal),
    enabled: Boolean(siteId) && enabled,
  });
}

export interface SiteLinkPlanEdgeRow {
  id: string;
  source_page_id: string;
  snapshot_id: string;
  target_page_id: string | null;
  target_url: string;
  is_internal: boolean;
  anchor_text: string | null;
}

export interface SiteLinkPlanEdgeResult {
  rows: SiteLinkPlanEdgeRow[];
  truncated: boolean;
}

/** Raw newest-first edge fetch for compliance scoring. Bounded and paged. */
export async function listSiteLinkPlanEdges(
  siteId: string,
  signal?: AbortSignal,
): Promise<SiteLinkPlanEdgeResult> {
  const db = await authenticatedWebDb(supabase);
  const abortSignal = signal ?? new AbortController().signal;
  const rows: SiteLinkPlanEdgeRow[] = [];
  for (let from = 0; from < LINK_PLAN_EDGE_CAP; from += FETCH_PAGE_SIZE) {
    const to = Math.min(from + FETCH_PAGE_SIZE, LINK_PLAN_EDGE_CAP) - 1;
    const response = await db
      .from("link_edge")
      .select(
        "id, source_page_id, snapshot_id, target_page_id, target_url, is_internal, anchor_text",
      )
      .eq("site_id", siteId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to)
      .abortSignal(abortSignal);
    const page = assertData(response.data, response.error);
    rows.push(...page);
    if (page.length < FETCH_PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

export function useSiteLinkPlanEdges(siteId: string, enabled = true) {
  return useQuery({
    queryKey: [...marketingKeys.site(siteId), "link-plan-edges"] as const,
    queryFn: ({ signal }) => listSiteLinkPlanEdges(siteId, signal),
    enabled: Boolean(siteId) && enabled,
  });
}

// ─── Aggregation ────────────────────────────────────────────────────────────

export interface SiteLinkOffender {
  sourcePageId: string;
  sourceUrl: string;
  /** Unique wrong anchors from this source, capped at 3. */
  anchors: string[];
  linkCount: number;
}

export interface SitePlannedLinkRow {
  score: PlannedLinkScore;
  /** Resolved canonical page id for the planned partner URL, when known. */
  partnerPageId: string | null;
}

export interface TargetPageCompliance {
  pageId: string;
  url: string;
  path: string | null;
  acceptedAnchors: string[];
  /** Current internal links pointing at this page (latest snapshots only). */
  inboundLinks: number;
  acceptableLinks: number;
  unacceptableLinks: number;
  /** Sources currently linking with a non-accepted anchor, worst first. */
  offenders: SiteLinkOffender[];
  planScores: SitePlannedLinkRow[];
  planSummary: PlannedLinkPlanSummary;
}

export interface SourcePageOutboundCompliance {
  pageId: string;
  url: string;
  path: string | null;
  planScores: SitePlannedLinkRow[];
  planSummary: PlannedLinkPlanSummary;
}

export interface SiteLinkComplianceTotals {
  pagesScanned: number;
  pagesWithPolicies: number;
  pagesWithInboundPlans: number;
  pagesWithOutboundPlans: number;
  trackedInboundLinks: number;
  acceptableLinks: number;
  unacceptableLinks: number;
  acceptablePercent: number | null;
  plannedLinks: number;
  plannedLinked: number;
  plannedWrongAnchor: number;
  plannedMissing: number;
}

export interface SiteLinkComplianceReport {
  totals: SiteLinkComplianceTotals;
  /** Pages with an anchor policy and/or inbound plan, biggest gaps first. */
  targets: TargetPageCompliance[];
  /** Pages with an outbound plan, biggest gaps first. */
  sources: SourcePageOutboundCompliance[];
  pagesTruncated: boolean;
  edgesTruncated: boolean;
  /** Edges considered current (source page's latest snapshot). */
  currentEdges: number;
}

function planGap(summary: PlannedLinkPlanSummary): number {
  return summary.missing + summary.wrongAnchor;
}

/** Pure aggregation — every page with a declared policy or plan, scored. */
export function buildSiteLinkComplianceReport(
  pages: SitePagePlanResult,
  edges: SiteLinkPlanEdgeResult,
): SiteLinkComplianceReport {
  const pageById = new Map(pages.rows.map((page) => [page.id, page]));
  const pageByUrl = new Map(
    pages.rows.map((page) => [normalizePlanUrl(page.url), page]),
  );
  const resolvePageId = (normalizedUrl: string): string | null =>
    pageByUrl.get(normalizedUrl)?.id ?? null;
  const policyForUrl = (normalizedUrl: string): string[] => {
    const page = pageByUrl.get(normalizedUrl);
    return page
      ? acceptedAnchorTextsFromDesiredValues(page.desired_values)
      : [];
  };

  // Current picture only: an edge counts when it belongs to its source page's
  // latest accepted snapshot, and self-links are navigation noise.
  const inboundByTarget = new Map<string, PlannedLinkObservation[]>();
  const outboundBySource = new Map<string, PlannedLinkObservation[]>();
  let currentEdges = 0;
  for (const edge of edges.rows) {
    const source = pageById.get(edge.source_page_id);
    if (!source?.latest_snapshot_id) continue;
    if (edge.snapshot_id !== source.latest_snapshot_id) continue;
    const targetPage =
      (edge.target_page_id ? pageById.get(edge.target_page_id) : undefined) ??
      pageByUrl.get(normalizePlanUrl(edge.target_url));
    if (targetPage && targetPage.id === source.id) continue;
    currentEdges += 1;

    const outboundList = outboundBySource.get(source.id);
    const outboundObservation: PlannedLinkObservation = {
      url: targetPage?.url ?? edge.target_url,
      pageId: targetPage?.id ?? edge.target_page_id,
      anchorText: edge.anchor_text,
    };
    if (outboundList) outboundList.push(outboundObservation);
    else outboundBySource.set(source.id, [outboundObservation]);

    if (edge.is_internal && targetPage) {
      const inboundObservation: PlannedLinkObservation = {
        url: source.url,
        pageId: source.id,
        anchorText: edge.anchor_text,
      };
      const inboundList = inboundByTarget.get(targetPage.id);
      if (inboundList) inboundList.push(inboundObservation);
      else inboundByTarget.set(targetPage.id, [inboundObservation]);
    }
  }

  const totals: SiteLinkComplianceTotals = {
    pagesScanned: pages.rows.length,
    pagesWithPolicies: 0,
    pagesWithInboundPlans: 0,
    pagesWithOutboundPlans: 0,
    trackedInboundLinks: 0,
    acceptableLinks: 0,
    unacceptableLinks: 0,
    acceptablePercent: null,
    plannedLinks: 0,
    plannedLinked: 0,
    plannedWrongAnchor: 0,
    plannedMissing: 0,
  };

  const targets: TargetPageCompliance[] = [];
  const sources: SourcePageOutboundCompliance[] = [];

  for (const page of pages.rows) {
    const acceptedAnchors = acceptedAnchorTextsFromDesiredValues(
      page.desired_values,
    );
    const inboundPlan = plannedLinksFromDesiredValues(
      page.desired_values,
      "inbound_links",
    );
    const outboundPlan = plannedLinksFromDesiredValues(
      page.desired_values,
      "outbound_links",
    );

    if (acceptedAnchors.length > 0 || inboundPlan.length > 0) {
      if (acceptedAnchors.length > 0) totals.pagesWithPolicies += 1;
      if (inboundPlan.length > 0) totals.pagesWithInboundPlans += 1;
      const inbound = inboundByTarget.get(page.id) ?? [];
      let acceptableLinks = 0;
      let unacceptableLinks = 0;
      const offendersById = new Map<string, SiteLinkOffender>();
      if (acceptedAnchors.length > 0) {
        for (const observation of inbound) {
          const status = anchorComplianceStatus(
            observation.anchorText,
            acceptedAnchors,
          );
          if (status === "acceptable") {
            acceptableLinks += 1;
            continue;
          }
          unacceptableLinks += 1;
          const sourceId = observation.pageId ?? observation.url;
          const offender = offendersById.get(sourceId) ?? {
            sourcePageId: observation.pageId ?? "",
            sourceUrl: observation.url,
            anchors: [],
            linkCount: 0,
          };
          offender.linkCount += 1;
          const anchor =
            observation.anchorText?.trim().replace(/\s+/g, " ") ||
            "(no anchor text)";
          if (offender.anchors.length < 3 && !offender.anchors.includes(anchor)) {
            offender.anchors.push(anchor);
          }
          offendersById.set(sourceId, offender);
        }
        totals.trackedInboundLinks += inbound.length;
        totals.acceptableLinks += acceptableLinks;
        totals.unacceptableLinks += unacceptableLinks;
      }
      const planScores = scorePlannedLinks(
        inboundPlan,
        inbound,
        () => acceptedAnchors,
      ).map(
        (score): SitePlannedLinkRow => ({
          score,
          partnerPageId:
            score.partnerPageId ??
            resolvePageId(normalizePlanUrl(score.entry.url)),
        }),
      );
      const planSummary = summarizePlannedLinkScores(
        planScores.map((row) => row.score),
      );
      totals.plannedLinks += planSummary.planned;
      totals.plannedLinked += planSummary.linked;
      totals.plannedWrongAnchor += planSummary.wrongAnchor;
      totals.plannedMissing += planSummary.missing;
      targets.push({
        pageId: page.id,
        url: page.url,
        path: page.path,
        acceptedAnchors,
        inboundLinks: inbound.length,
        acceptableLinks,
        unacceptableLinks,
        offenders: [...offendersById.values()].sort(
          (a, b) =>
            b.linkCount - a.linkCount || a.sourceUrl.localeCompare(b.sourceUrl),
        ),
        planScores,
        planSummary,
      });
    }

    if (outboundPlan.length > 0) {
      totals.pagesWithOutboundPlans += 1;
      const outbound = outboundBySource.get(page.id) ?? [];
      const planScores = scorePlannedLinks(
        outboundPlan,
        outbound,
        policyForUrl,
      ).map(
        (score): SitePlannedLinkRow => ({
          score,
          partnerPageId:
            score.partnerPageId ??
            resolvePageId(normalizePlanUrl(score.entry.url)),
        }),
      );
      const planSummary = summarizePlannedLinkScores(
        planScores.map((row) => row.score),
      );
      totals.plannedLinks += planSummary.planned;
      totals.plannedLinked += planSummary.linked;
      totals.plannedWrongAnchor += planSummary.wrongAnchor;
      totals.plannedMissing += planSummary.missing;
      sources.push({
        pageId: page.id,
        url: page.url,
        path: page.path,
        planScores,
        planSummary,
      });
    }
  }

  if (totals.trackedInboundLinks > 0) {
    totals.acceptablePercent =
      (totals.acceptableLinks / totals.trackedInboundLinks) * 100;
  }

  targets.sort(
    (a, b) =>
      b.unacceptableLinks +
        planGap(b.planSummary) -
        (a.unacceptableLinks + planGap(a.planSummary)) ||
      b.inboundLinks - a.inboundLinks ||
      a.url.localeCompare(b.url),
  );
  sources.sort(
    (a, b) =>
      planGap(b.planSummary) - planGap(a.planSummary) ||
      a.url.localeCompare(b.url),
  );

  return {
    totals,
    targets,
    sources,
    pagesTruncated: pages.truncated,
    edgesTruncated: edges.truncated,
    currentEdges,
  };
}
