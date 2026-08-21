"use client";

import {
  planForRoute,
  type RoutePlan,
} from "@/features/marketing/content-plan/page-seo-plan";
import {
  usePlanNode,
  useSitePlanIndex,
} from "@/features/marketing/content-plan/data/hooks";
import { recordUnavailable } from "@/lib/records/recordUnavailable";

export type CmsPagePlanContextStatus =
  "unlinked" | "loading" | "ready" | "error";

/**
 * The page's SEO plan, read from THE one store
 * (`web.page.desired_values.keyword_plan`, content-planning invariant 9) —
 * never from `plan.node`'s retired SEO copies. Null when the route has no
 * plan record yet.
 */
export interface CmsPagePlanSeo {
  primary_keyword_id: string | null;
  primary_keyword: string | null;
  secondary_keywords: string[];
  page_role: string | null;
  supports_routes: string[];
  reason: string | null;
  meta_title_desired: string | null;
  meta_description_desired: string | null;
  planned_links: Array<{ url: string; anchor_text?: string }>;
}

export interface CmsPagePlanContext {
  status: CmsPagePlanContextStatus;
  error: string | null;
  node: {
    id: string;
    site_id: string;
    label: string;
    route: string | null;
    node_type: string;
    status_id: string | null;
    /** Convenience mirrors of `seo_plan` — the fields agents ask for first. */
    primary_keyword_id: string | null;
    primary_keyword: string | null;
    brief: string[];
    meta_title: string | null;
    meta_description: string | null;
    seo_plan: CmsPagePlanSeo | null;
    updated_at: string | null;
  } | null;
}

function seoFromRoutePlan(plan: RoutePlan | null): CmsPagePlanSeo | null {
  if (!plan) return null;
  return {
    primary_keyword_id: plan.draft.primaryKeywordId,
    primary_keyword: plan.primaryKeyword?.phrase ?? null,
    secondary_keywords: plan.secondaryKeywords.map((kw) => kw.phrase),
    page_role: plan.draft.pageRole || null,
    supports_routes: plan.draft.supportsRoutes,
    reason: plan.draft.reason || null,
    meta_title_desired: plan.metaTitle || null,
    meta_description_desired: plan.metaDescription || null,
    planned_links: plan.outboundLinks.map((link) => ({
      url: link.url,
      ...(link.anchor_text ? { anchor_text: link.anchor_text } : {}),
    })),
  };
}

/**
 * Resolve the complete planning input behind a CMS page. The page editor used
 * to expose only `plan_node_id` to its agents, forcing them to rediscover the
 * brief and keyword (or proceed without them).
 *
 * Two reads, both canonical: the `plan.node` row for plan content (label,
 * route, brief, status — still canonical on the node), and the site's SEO-plan
 * index for keyword/role/meta intent (`web.page.desired_values`, invariant 9 —
 * the node's SEO columns are retired copies and MUST NOT be read; they go
 * stale the moment `SeoPlanEditor` writes the real store).
 */
export function useCmsPagePlanContext(
  planNodeId: string | null | undefined,
): CmsPagePlanContext {
  const nodeQuery = usePlanNode(planNodeId ?? null);
  const siteId = nodeQuery.data?.site_id ?? null;
  const planIndexQuery = useSitePlanIndex(siteId);

  if (!planNodeId) {
    return { status: "unlinked", error: null, node: null };
  }
  if (nodeQuery.isError) {
    return {
      status: "error",
      error:
        nodeQuery.error instanceof Error
          ? nodeQuery.error.message
          : "The linked plan page could not be loaded.",
      node: null,
    };
  }
  if (nodeQuery.isLoading || (siteId && planIndexQuery.isLoading)) {
    return { status: "loading", error: null, node: null };
  }
  if (!nodeQuery.data) {
    return {
      status: "error",
      error: recordUnavailable({
        entity: "plan page",
        reason: "unknown",
        recordId: planNodeId,
        relation: "plan.node",
      }).message,
      node: null,
    };
  }

  const node = nodeQuery.data;
  const seoPlan = seoFromRoutePlan(
    planForRoute(planIndexQuery.data ?? null, node.route),
  );
  return {
    status: "ready",
    error: planIndexQuery.isError
      ? planIndexQuery.error instanceof Error
        ? planIndexQuery.error.message
        : "The page's SEO plan could not be resolved."
      : null,
    node: {
      id: node.id,
      site_id: node.site_id,
      label: node.label,
      route: node.route,
      node_type: node.node_type,
      status_id: node.status_id,
      primary_keyword_id: seoPlan?.primary_keyword_id ?? null,
      primary_keyword: seoPlan?.primary_keyword ?? null,
      brief: node.brief ?? [],
      meta_title: seoPlan?.meta_title_desired ?? null,
      meta_description: seoPlan?.meta_description_desired ?? null,
      seo_plan: seoPlan,
      updated_at: node.updated_at,
    },
  };
}
