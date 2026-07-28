/**
 * app/(core)/marketing/content-plan/create-refine/_lib/commit.ts
 *
 * Turn an approved work order into real `plan.node` rows.
 *
 * IDEMPOTENT BY ROUTE, exactly like aidream's `apply_plan_tree` (whose identity
 * is the DB's live unique key `(site_id, parent_id, slug)`): a node whose route
 * already exists is adopted as the parent for its children and reported as
 * `existing` — never duplicated, never clobbered. That is what makes this work
 * on a HALF-BUILT site, not just a blank one.
 *
 * Writes go through the feature's ONE plan write path (`createPlanNode`); the
 * DB owns `route`/`depth`/`pillar_label`/`cluster_label` and every rejection
 * message. Errors are collected per node and reported verbatim — a failing
 * branch stops its own subtree (named as such) and never the whole run.
 */
import { createPlanNode } from "@/features/marketing/content-plan/data/service";
import { extractErrorMessage } from "@/utils/errors";

import type { PlanSpecNode } from "./archetypes";

export interface CommitProgress {
  done: number;
  total: number;
  route: string;
}

export interface CommitFailure {
  route: string;
  message: string;
}

export interface CommitResult {
  created: string[];
  existing: string[];
  failed: CommitFailure[];
  /** Loud: a created row whose DB-computed route differs from the preview. */
  routeMismatches: { expected: string; actual: string }[];
}

export interface CommitArgs {
  roots: PlanSpecNode[];
  siteId: string;
  organizationId: string;
  /** Live plan routes → node id, from the site's current node list. */
  existingIdByRoute: Map<string, string>;
  /** `plan_page_type` slug → category id. Missing slugs are refused upfront. */
  pageTypeIdBySlug: Map<string, string>;
  /** `plan_status` id for the default status of generated nodes. */
  statusId: string;
  onProgress?: (progress: CommitProgress) => void;
}

/** Every page_type slug the work order needs — checked BEFORE any write. */
export function missingPageTypes(
  roots: PlanSpecNode[],
  pageTypeIdBySlug: Map<string, string>,
): string[] {
  const missing = new Set<string>();
  const visit = (node: PlanSpecNode) => {
    if (node.pageType && !pageTypeIdBySlug.has(node.pageType)) {
      missing.add(node.pageType);
    }
    for (const child of node.children) visit(child);
  };
  for (const node of roots) visit(node);
  return [...missing].sort();
}

function countNodes(nodes: PlanSpecNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);
}

export async function commitArchetype(args: CommitArgs): Promise<CommitResult> {
  const result: CommitResult = {
    created: [],
    existing: [],
    failed: [],
    routeMismatches: [],
  };
  const total = countNodes(args.roots);
  let done = 0;

  const advance = (route: string) => {
    done += 1;
    args.onProgress?.({ done, total, route });
  };

  const applyNode = async (
    node: PlanSpecNode,
    parentId: string | null,
  ): Promise<void> => {
    const existingId = args.existingIdByRoute.get(node.route);
    let nodeId: string | null = existingId ?? null;

    if (existingId) {
      result.existing.push(node.route);
      advance(node.route);
    } else {
      try {
        const created = await createPlanNode({
          site_id: args.siteId,
          organization_id: args.organizationId,
          parent_id: parentId,
          node_type: node.nodeType,
          slug: node.slug,
          label: node.label,
          brief: node.brief,
          page_type_id: node.pageType
            ? (args.pageTypeIdBySlug.get(node.pageType) ?? null)
            : null,
          status_id: args.statusId,
          attributes: node.attributes,
        });
        nodeId = created.id;
        result.created.push(created.route ?? node.route);
        args.existingIdByRoute.set(created.route ?? node.route, created.id);
        if (created.route && created.route !== node.route) {
          // The DB is the authority on routes; a divergence means the preview
          // lied to the user. Never silent.
          result.routeMismatches.push({
            expected: node.route,
            actual: created.route,
          });
        }
      } catch (error) {
        result.failed.push({
          route: node.route,
          message: extractErrorMessage(error),
        });
        nodeId = null;
      }
      advance(node.route);
    }

    if (nodeId === null) {
      // Parent failed — its subtree cannot be addressed. Report each child
      // explicitly instead of silently dropping it.
      const skipSubtree = (child: PlanSpecNode) => {
        result.failed.push({
          route: child.route,
          message: `Skipped — its parent ${node.route} could not be created.`,
        });
        advance(child.route);
        for (const grandChild of child.children) skipSubtree(grandChild);
      };
      for (const child of node.children) skipSubtree(child);
      return;
    }

    for (const child of node.children) {
      await applyNode(child, nodeId);
    }
  };

  for (const root of args.roots) {
    await applyNode(root, null);
  }
  return result;
}
