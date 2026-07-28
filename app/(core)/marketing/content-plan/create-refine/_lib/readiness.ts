/**
 * app/(core)/marketing/content-plan/create-refine/_lib/readiness.ts
 *
 * The persistent readiness checklist: an archetype's work order measured
 * against the site's LIVE `plan.node` rows.
 *
 * Honesty rule — every number here is measured, never assumed:
 *  • core pages and family coverage are measured against live routes;
 *  • foundation requirements (tokens, header, footer, nav entries, assets) are
 *    shown with their resolved counts but carry NO met/unmet state, because
 *    what satisfies them lives in the CMS database (a different Supabase
 *    project this client does not read). Claiming "met" from here would be a
 *    fabricated check; aidream's `foundation_checklist` is the surface that
 *    can measure them.
 */
import type { PlanNodeRow } from "@/features/marketing/content-plan/types";

import type { ExpandedArchetype, PlanSpecNode } from "./archetypes";
import { walkSpec } from "./archetypes";

export type CoverageState = "met" | "partial" | "unmet";

export interface CorePageStatus {
  route: string;
  label: string;
  present: boolean;
}

export interface FamilyCoverage {
  key: string;
  label: string;
  route: string;
  target: number;
  planned: number;
  hubPresent: boolean;
  state: CoverageState;
  materialize: "pages" | "count_only";
}

export interface PlanReadiness {
  corePages: CorePageStatus[];
  families: FamilyCoverage[];
  /** Live routes that the work order does not describe — hand-authored pages. */
  extraRoutes: string[];
  /** Work-order routes not yet in the plan. */
  missingRoutes: string[];
  liveNodeCount: number;
  targetPageCount: number;
  /** Live nodes carrying no brief — the next real piece of work. */
  nodesWithoutBrief: number;
  /** Live nodes with no primary keyword bound. */
  nodesWithoutKeyword: number;
}

function normalizeRoute(route: string | null): string | null {
  if (!route) return null;
  if (route === "/") return "/";
  return route.endsWith("/") ? route.slice(0, -1) : route;
}

export function buildReadiness(
  expanded: ExpandedArchetype,
  nodes: PlanNodeRow[],
): PlanReadiness {
  const liveRoutes = new Set<string>();
  for (const node of nodes) {
    const route = normalizeRoute(node.route);
    if (route) liveRoutes.add(route);
  }

  const spec = walkSpec(expanded.roots);
  const specByRoute = new Map<string, PlanSpecNode>();
  for (const node of spec) specByRoute.set(node.route, node);

  const corePages: CorePageStatus[] = spec
    .filter((node) => node.role === "core")
    .map((node) => ({
      route: node.route,
      label: node.label,
      present: liveRoutes.has(node.route),
    }));

  const families: FamilyCoverage[] = expanded.families.map((family) => {
    const prefix = `${family.route}/`;
    let planned = 0;
    for (const route of liveRoutes) {
      if (route.startsWith(prefix)) planned += 1;
    }
    const hubPresent = liveRoutes.has(family.route);
    const state: CoverageState =
      family.count > 0 && planned >= family.count
        ? "met"
        : planned > 0
          ? "partial"
          : "unmet";
    return {
      key: family.key,
      label: family.label,
      route: family.route,
      target: family.count,
      planned,
      hubPresent,
      state,
      materialize: family.materialize,
    };
  });

  const missingRoutes = expanded.routes.filter((route) => !liveRoutes.has(route));
  const extraRoutes = [...liveRoutes]
    .filter((route) => !specByRoute.has(route))
    .sort();

  let nodesWithoutBrief = 0;
  let nodesWithoutKeyword = 0;
  for (const node of nodes) {
    if (!node.brief || node.brief.length === 0) nodesWithoutBrief += 1;
    if (!node.primary_keyword_id) nodesWithoutKeyword += 1;
  }

  return {
    corePages,
    families,
    extraRoutes,
    missingRoutes,
    liveNodeCount: nodes.length,
    targetPageCount: expanded.pageCount,
    nodesWithoutBrief,
    nodesWithoutKeyword,
  };
}

/** New / already-planned split of the work order, for the commit preview. */
export interface RoutePreviewItem {
  route: string;
  label: string;
  role: PlanSpecNode["role"];
  familyKey: string | null;
  pageType: string | null;
  exists: boolean;
}

export function buildRoutePreview(
  expanded: ExpandedArchetype,
  nodes: PlanNodeRow[],
): RoutePreviewItem[] {
  const liveRoutes = new Set<string>();
  for (const node of nodes) {
    const route = normalizeRoute(node.route);
    if (route) liveRoutes.add(route);
  }
  return walkSpec(expanded.roots).map((node) => ({
    route: node.route,
    label: node.label,
    role: node.role,
    familyKey: node.familyKey,
    pageType: node.pageType,
    exists: liveRoutes.has(node.route),
  }));
}
