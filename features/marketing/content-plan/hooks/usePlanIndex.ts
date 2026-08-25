"use client";

/**
 * features/marketing/content-plan/hooks/usePlanIndex.ts
 *
 * THE AGENT'S EYES — aidream's plan index
 * (GET /content-plan/sites/{id}/plan-index?node_id=…) held in the query cache.
 *
 * WHY THIS EXISTS. `content_plan.p3_family` asks "what does this page cover,
 * what does it leave to its siblings, where does it link?" and — measured on
 * 2026-08-25, site f8e332bb / node 561c5191 — the agent was handed 1 of 295
 * plan pages with ZERO siblings, so every internal link it proposed was
 * invented. Fluent output, valid JSON, structurally unanswerable question.
 * The cure is that a human can SEE the exact payload before trusting the
 * answer, which is what this hook feeds.
 *
 * 🚨 `rendered` IS THE POINT. Those five strings are byte-for-byte what the
 * server interpolates into the agent's prompt — never a client reconstruction
 * and never a prettified summary of a summary. Everything else in the response
 * (entries, groups, neighbours, branch_context) is the same truth in
 * structured form, offered so the UI can make "why was this page selected"
 * auditable. If the two ever disagree, `rendered` wins, because `rendered` is
 * what the agent actually reads.
 *
 * READ-ONLY. A GET with no body; nothing here mutates a node, a run, a
 * mandate or a provision. `staleTime` is short because the plan tree is
 * edited live and a stale payload preview would be its own lie.
 */
import { useQuery } from "@tanstack/react-query";

import { apiGet, buildPath } from "@/lib/api/typed-client";
import type { components } from "@/types/python-generated/api-types";

import { planKeys } from "../data/hooks";

export type PlanIndexView = components["schemas"]["PlanIndexView"];
export type PlanIndexEntry = components["schemas"]["PlanIndexEntry"];
export type PlanGroup = components["schemas"]["PlanGroup"];
export type PlanNeighbour = components["schemas"]["NeighbourSelection"];
export type PlanBranchContext = components["schemas"]["BranchContext"];
export type PlanBranchRef = components["schemas"]["BranchRef"];
export type PlanCoverage = components["schemas"]["PlanCoverage"];

/**
 * The five text shapes the `content_plan.family` PROVISION offers at this call
 * site, in the order a human should read them: the bounded, page-specific ones
 * first, the whole-plan ones after.
 *
 * `offered` mirrors the provision declaration in aidream
 * (`services/mandates/client_mandates.py` → CONTENT_PLAN_FAMILY_PROVISION).
 * `guaranteed: false` there means the value can legitimately arrive EMPTY —
 * which is exactly the silent-cap failure this screen exists to expose.
 */
export const PAYLOAD_SHAPES = [
  {
    key: "plan_neighbours",
    title: "Neighbours",
    blurb:
      "The plan pages most likely to compete with this one, each with the reason it was selected. This is the LEGAL SET for any internal link the page proposes — a link to anything not on this list is fabricated.",
    guaranteed: true,
    scope: "node",
  },
  {
    key: "plan_branch_context",
    title: "Branch context",
    blurb:
      "The walk UP the plan tree: this page's branch and siblings, the ancestor branches above it, and the neighbouring branches whose territory it must not take. Bounded at any plan size.",
    guaranteed: true,
    scope: "node",
  },
  {
    key: "plan_index_full",
    title: "Full index",
    blurb:
      "Every page in the plan as one condensed identity line. Omitted entirely above the threshold — when that happens this value arrives EMPTY and the agent is told so by the coverage line.",
    guaranteed: false,
    scope: "site",
  },
  {
    key: "plan_groups",
    title: "Groups",
    blurb:
      "The plan's groups, which ARE the tree's branches — one per branch node, with its recorded purpose, its direct children and its subtree size. The planner's own structure, not a similarity cluster invented beside it.",
    guaranteed: false,
    scope: "site",
  },
  {
    key: "plan_coverage",
    title: "Coverage",
    blurb:
      "The honesty line the agent is told before it answers: how much of the plan it is seeing, how that slice was chosen, and what the plan itself is missing.",
    guaranteed: true,
    scope: "site",
  },
] as const;

export type PayloadShapeKey = (typeof PAYLOAD_SHAPES)[number]["key"];

/**
 * What a per-page family call would actually consume, and therefore what this
 * screen opens on. Neighbours is the shape whose failure produced fabricated
 * links, so it is the default view.
 */
export const DEFAULT_NODE_SHAPE: PayloadShapeKey = "plan_neighbours";
export const DEFAULT_SITE_SHAPE: PayloadShapeKey = "plan_index_full";

async function loadPlanIndex(
  siteId: string,
  nodeId: string | null,
  signal?: AbortSignal,
): Promise<PlanIndexView> {
  const { data } = await apiGet(
    buildPath("/content-plan/sites/{site_id}/plan-index", { site_id: siteId }),
    // withQuery drops empty values, so a site-level view sends no node_id at
    // all rather than `?node_id=` (which the server would read as a node).
    { query: { node_id: nodeId ?? undefined }, signal },
  );
  return data;
}

/**
 * @param siteId  the plan's site; null disables the query.
 * @param nodeId  null → the whole-plan view (no neighbours, no branch walk).
 * @param enabled false until the viewer opens the screen — this is a real
 *                server call over the whole plan, never fired on mount.
 */
export function usePlanIndex(
  siteId: string | null,
  nodeId: string | null,
  enabled: boolean,
) {
  return useQuery<PlanIndexView>({
    queryKey: planKeys.planIndex(siteId ?? "none", nodeId),
    queryFn: ({ signal }) => loadPlanIndex(siteId as string, nodeId, signal),
    enabled: Boolean(siteId) && enabled,
    staleTime: 30_000,
    retry: 1,
  });
}
