/**
 * features/marketing/content-plan/setup/preview.ts
 *
 * The route preview — what THIS commit will actually do, diffed against the
 * site's live plan, before anything is written.
 *
 * THE IDENTITY RULE (the whole point of this file): the diff walks the DB's own
 * unique key `(site_id, parent_id, slug)` — resolved parent-first down the tree
 * — which is exactly what `commitArchetype` writes with. Diffing by route while
 * writing by (parent, slug) disagrees in precisely the case that matters: a
 * page that already lives at this route under a DIFFERENT parent. The second
 * unique index (`node_site_route_key (site_id, route)`) rejects that insert, so
 * it is called out here as `conflict` BEFORE the user commits rather than
 * discovered as a failure afterwards.
 */
import type { PlanNodeRow } from "@/features/marketing/content-plan/types";

import type { PlanSpecNode } from "./archetypes";
import { identityKey, type CommitRow } from "./service";

export type RouteState = "new" | "exists" | "conflict" | "created" | "failed";

export interface PreviewRow {
  spec: PlanSpecNode;
  depth: number;
  state: RouteState;
  error?: string;
}

export interface PreviewSummary {
  rows: PreviewRow[];
  counts: Record<RouteState | "all", number>;
}

function normalizeRoute(route: string | null): string | null {
  if (!route) return null;
  if (route === "/") return "/";
  return route.endsWith("/") ? route.slice(0, -1) : route;
}

export function buildPreview(args: {
  roots: PlanSpecNode[];
  liveNodes: PlanNodeRow[];
  /** The last commit's per-row outcome, so the report survives a re-render. */
  lastRun: CommitRow[] | null;
}): PreviewSummary {
  const byIdentity = new Map<string, PlanNodeRow>();
  const byRoute = new Map<string, PlanNodeRow>();
  for (const node of args.liveNodes) {
    byIdentity.set(identityKey(node.parent_id, node.slug), node);
    const route = normalizeRoute(node.route);
    if (route) byRoute.set(route, node);
  }
  const runByRoute = new Map<string, CommitRow>();
  for (const row of args.lastRun ?? []) runByRoute.set(row.route, row);

  const rows: PreviewRow[] = [];
  const walk = (specs: PlanSpecNode[], parentId: string | null, depth: number) => {
    for (const spec of specs) {
      const match = byIdentity.get(identityKey(parentId, spec.slug));
      const run = runByRoute.get(spec.route);
      let state: RouteState;
      if (run?.state === "failed") state = "failed";
      else if (run?.state === "created") state = "created";
      else if (match) state = "exists";
      else if (byRoute.has(spec.route)) state = "conflict";
      else state = "new";
      rows.push({ spec, depth, state, error: run?.error });
      walk(spec.children, match?.id ?? null, depth + 1);
    }
  };
  walk(args.roots, null, 0);

  const counts: Record<RouteState | "all", number> = {
    all: rows.length,
    new: 0,
    exists: 0,
    conflict: 0,
    created: 0,
    failed: 0,
  };
  for (const row of rows) counts[row.state] += 1;
  return { rows, counts };
}
