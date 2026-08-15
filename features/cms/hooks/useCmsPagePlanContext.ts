"use client";

import {
  useKeywordLabels,
  usePlanNode,
} from "@/features/marketing/content-plan/data/hooks";

export type CmsPagePlanContextStatus =
  "unlinked" | "loading" | "ready" | "error";

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
    primary_keyword_id: string | null;
    primary_keyword: string | null;
    brief: string[];
    meta_title: string | null;
    meta_description: string | null;
    attributes: unknown;
    updated_at: string | null;
  } | null;
}

/**
 * Resolve the complete planning input behind a CMS page. The page editor used
 * to expose only `plan_node_id` to its agents, forcing them to rediscover the
 * brief and keyword (or proceed without them). This is the one direct-Supabase
 * read used by both the editor scope and the list's AI action dialog.
 */
export function useCmsPagePlanContext(
  planNodeId: string | null | undefined,
): CmsPagePlanContext {
  const nodeQuery = usePlanNode(planNodeId ?? null);
  const primaryKeywordId = nodeQuery.data?.primary_keyword_id ?? null;
  const keywordQuery = useKeywordLabels(
    primaryKeywordId ? [primaryKeywordId] : [],
  );

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
  if (nodeQuery.isLoading || (primaryKeywordId && keywordQuery.isLoading)) {
    return { status: "loading", error: null, node: null };
  }
  if (!nodeQuery.data) {
    return {
      status: "error",
      error: "The linked plan page was not found.",
      node: null,
    };
  }

  const keyword = primaryKeywordId
    ? (keywordQuery.data?.find((row) => row.id === primaryKeywordId)?.phrase ??
      null)
    : null;
  const node = nodeQuery.data;
  return {
    status: "ready",
    error: keywordQuery.isError
      ? keywordQuery.error instanceof Error
        ? keywordQuery.error.message
        : "The target keyword could not be resolved."
      : null,
    node: {
      id: node.id,
      site_id: node.site_id,
      label: node.label,
      route: node.route,
      node_type: node.node_type,
      status_id: node.status_id,
      primary_keyword_id: node.primary_keyword_id,
      primary_keyword: keyword,
      brief: node.brief ?? [],
      meta_title: node.meta_title,
      meta_description: node.meta_description,
      attributes: node.attributes,
      updated_at: node.updated_at,
    },
  };
}
