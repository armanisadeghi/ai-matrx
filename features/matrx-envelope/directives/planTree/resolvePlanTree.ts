/**
 * Read-side resolution for plan directives: after the aidream dispatcher
 * applies a `plan_tree` / `plan_node_patch` envelope (server-side, as the
 * user, under RLS — the client NEVER applies), poll the plan schema through
 * the canonical content-plan read service and turn the optimistic card into
 * live routes. Mirrors createProjectWithTasks/resolveCreatedProject.
 */
import {
  getPlanNode,
  listPlanNodes,
} from "@/features/marketing/content-plan/data/service";
import type { PlanNodeRow } from "@/features/marketing/content-plan/types";
import { listSiteOptions } from "@/features/marketing/data/service";

import type {
  PlanNodePatchItem,
  PlanTreeDirectiveItem,
  PlanTreeNodeSpec,
  ResolvedPlanTree,
} from "./types";
import { countSpecNodes } from "./types";

export const POLL_DELAYS_MS = [0, 2000, 5000] as const;

function collectSlugs(
  nodes: PlanTreeNodeSpec[],
  out: Set<string>,
): Set<string> {
  for (const node of nodes) {
    if (node.slug) out.add(node.slug);
    collectSlugs(node.children ?? [], out);
  }
  return out;
}

/** Resolve `site_id` or plain-text `site` (domain/name) to a live web.site id. */
export async function resolvePlanTreeSiteId(
  item: Pick<PlanTreeDirectiveItem, "site_id" | "site">,
): Promise<string | null> {
  if (item.site_id) return item.site_id;
  const needle = item.site?.trim().toLowerCase();
  if (!needle) return null;
  const options = await listSiteOptions();
  const match = options.find((site) => {
    const domain = site.domain?.trim().toLowerCase();
    const name = site.name?.trim().toLowerCase();
    return domain === needle || name === needle;
  });
  return match?.id ?? null;
}

/**
 * Resolve one `plan_tree` item: fetch the site's live nodes and match the
 * spec's slugs. Returns null until at least one spec node exists live.
 */
export async function resolvePlanTree(
  item: PlanTreeDirectiveItem,
): Promise<ResolvedPlanTree | null> {
  // Addressable by site_id OR plain-text site (domain/name). The server
  // resolves text at apply time; the card must re-find that site so Apply
  // + deep-link work when the agent omitted site_id (2026-07-26).
  const siteId = await resolvePlanTreeSiteId(item);
  if (!siteId) return null;
  const live = await listPlanNodes(siteId);
  if (live.length === 0) return null;

  const bySlug = new Map<string, PlanNodeRow>();
  for (const row of live) {
    if (row.slug) bySlug.set(row.slug, row);
  }
  const homeRow = live.find((row) => row.node_type === "home") ?? null;

  const specSlugs = collectSlugs(item.nodes, new Set());
  let matched = 0;
  for (const slug of specSlugs) if (bySlug.has(slug)) matched += 1;
  // Slugless spec nodes (home) count as matched when a live home exists.
  const specTotal = countSpecNodes(item.nodes);
  const slugless = specTotal - specSlugs.size;
  if (slugless > 0 && homeRow) matched += slugless;

  if (matched === 0) return null;

  return {
    siteId,
    matchedCount: matched,
    liveCount: live.length,
    topLevel: item.nodes.map((node) => ({
      label: node.label,
      route: node.slug
        ? (bySlug.get(node.slug)?.route ?? null)
        : (homeRow?.route ?? null),
    })),
  };
}

export interface ResolvedPatchedNode {
  id: string;
  label: string;
  route: string | null;
}

/** Resolve one `plan_node_patch` target by node_id or site_id+route. */
export async function resolvePatchedNode(
  item: PlanNodePatchItem,
): Promise<ResolvedPatchedNode | null> {
  if (item.node_id) {
    const row = await getPlanNode(item.node_id);
    return { id: row.id, label: row.label, route: row.route };
  }
  if (item.site_id && item.route) {
    const live = await listPlanNodes(item.site_id);
    // The patch may have changed slug (and therefore route); match the
    // addressed route first, then fall back to the patched label.
    const byRoute = live.find((row) => row.route === item.route);
    const match =
      byRoute ??
      (item.label ? live.find((row) => row.label === item.label) : undefined);
    return match
      ? { id: match.id, label: match.label, route: match.route }
      : null;
  }
  return null;
}
