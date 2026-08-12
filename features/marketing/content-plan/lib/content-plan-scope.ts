/**
 * features/marketing/content-plan/lib/content-plan-scope.ts
 *
 * Runtime scope builder for the `matrx-user/content-plan` surface — turns the
 * workbench's ALREADY-LOADED query data (never fetches) into the typed values
 * declared in `features/surfaces/manifests/content-plan.manifest.ts`, and
 * returns through `createContentPlanScope` so TypeScript enforces the
 * declaration. Called at trigger time by the `SurfaceRuntimeProvider` in
 * `ContentPlanWorkbench.tsx` with live refs — `undefined` inputs mean "not
 * loaded", and the corresponding keys are simply omitted (honest emptiness,
 * per the manifest's descriptions).
 */
import type { MarketingSite } from "@/features/marketing/types";
import type {
  PlatformCategory,
  AssociationEdge,
} from "@/features/scopes/types";
import { createContentPlanScope } from "@/features/surfaces/manifests/content-plan.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";

import type { PlanView } from "../hooks/usePlanWorkspaceParams";
import type { PlanEntityRow, PlanNodeRow, PlanProfileRow } from "../types";

export interface ContentPlanScopeInput {
  view: PlanView;
  /** `?site=` param — null when no site is selected yet. */
  siteId: string | null;
  /** The selected site's row, when the site list has loaded and matched. */
  site: MarketingSite | null;
  /** Sites offered by the header picker (org-scoped with fallback). */
  siteOptions: readonly MarketingSite[];
  /** Live plan nodes — undefined while loading / no site selected. */
  nodes: readonly PlanNodeRow[] | undefined;
  /** Live plan entities — undefined while loading / no site selected. */
  entities: readonly PlanEntityRow[] | undefined;
  /** Org vertical profiles — undefined while loading / org unknown. */
  profiles: readonly PlanProfileRow[] | undefined;
  /** `plan_status` categories (empty array while loading). */
  statusCategories: readonly PlatformCategory[];
  selectedNode: PlanNodeRow | null;
  /** Edges already cached for the selected node — undefined when not loaded. */
  selectedNodeEdges: readonly AssociationEdge[] | undefined;
}

/** One compact `plan_tree` record — the manifest's declared shape. */
function compactNode(
  node: PlanNodeRow,
  statusSlugById: ReadonlyMap<string, string>,
): Record<string, unknown> {
  return {
    id: node.id,
    parent_id: node.parent_id,
    depth: node.depth,
    route: node.route,
    label: node.label,
    node_type: node.node_type,
    status: node.status_id
      ? (statusSlugById.get(node.status_id) ?? null)
      : null,
    pillar_label: node.pillar_label,
    cluster_label: node.cluster_label,
    priority: node.priority,
    has_primary_keyword: node.primary_keyword_id !== null,
  };
}

/** The selected node's full detail — every editable field + derived cache. */
function nodeDetail(node: PlanNodeRow): Record<string, unknown> {
  return {
    id: node.id,
    parent_id: node.parent_id,
    label: node.label,
    slug: node.slug,
    node_type: node.node_type,
    page_type_id: node.page_type_id,
    status_id: node.status_id,
    priority: node.priority,
    technical_depth: node.technical_depth,
    needs_reviewer: node.needs_reviewer,
    primary_keyword_id: node.primary_keyword_id,
    meta_title: node.meta_title,
    meta_description: node.meta_description,
    brief: node.brief,
    attributes: node.attributes,
    // Trigger-owned derived cache — read-only evidence.
    route: node.route,
    depth: node.depth,
    pillar_label: node.pillar_label,
    cluster_label: node.cluster_label,
    updated_at: node.updated_at,
  };
}

export function buildContentPlanScope(
  input: ContentPlanScopeInput,
): SurfaceScopePayload {
  const {
    view,
    siteId,
    site,
    siteOptions,
    nodes,
    entities,
    profiles,
    statusCategories,
    selectedNode,
    selectedNodeEdges,
  } = input;

  const statusSlugById = new Map<string, string>();
  for (const category of statusCategories) {
    if (category.slug) statusSlugById.set(category.id, category.slug);
  }

  let nodeCountsByStatus: Record<string, number> | undefined;
  if (nodes !== undefined && statusCategories.length > 0) {
    nodeCountsByStatus = {};
    for (const node of nodes) {
      const key = node.status_id
        ? (statusSlugById.get(node.status_id) ?? "unset")
        : "unset";
      nodeCountsByStatus[key] = (nodeCountsByStatus[key] ?? 0) + 1;
    }
  }

  return createContentPlanScope({
    view,
    site_id: siteId ?? undefined,
    site_domain: site ? (site.domain ?? site.name ?? undefined) : undefined,
    site_organization_id: site?.organization_id ?? undefined,
    site: site
      ? {
          id: site.id,
          domain: site.domain,
          name: site.name,
          organization_id: site.organization_id,
          brand_id: site.brand_id,
        }
      : undefined,
    site_options:
      siteOptions.length > 0
        ? siteOptions.map((option) => ({
            id: option.id,
            domain: option.domain,
            name: option.name,
            has_brand: option.brand_id !== null,
          }))
        : undefined,
    selected_node_id: selectedNode?.id,
    node_total: nodes?.length,
    node_counts_by_status: nodeCountsByStatus,
    plan_tree: nodes?.map((node) => compactNode(node, statusSlugById)),
    status_options:
      statusCategories.length > 0
        ? statusCategories.map((category) => ({
            id: category.id,
            slug: category.slug,
            name: category.name,
          }))
        : undefined,
    selected_node: selectedNode ? nodeDetail(selectedNode) : undefined,
    selected_node_edges: selectedNodeEdges?.map((edge) => ({
      role: edge.role,
      other_type: edge.otherType,
      other_id: edge.otherId,
      direction: edge.direction,
    })),
    entity_total: entities?.length,
    entities_summary:
      entities && entities.length > 0
        ? entities.map((entity) => ({
            id: entity.id,
            label: entity.label,
            entity_type: entity.entity_type,
          }))
        : undefined,
    profile_verticals:
      profiles && profiles.length > 0
        ? profiles.map((profile) => ({
            id: profile.id,
            vertical: profile.vertical,
          }))
        : undefined,
  });
}
