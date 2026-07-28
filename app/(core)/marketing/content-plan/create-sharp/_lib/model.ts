/**
 * app/(core)/marketing/content-plan/create-sharp/_lib/model.ts
 *
 * PURE: fold the expanded archetype together with the site's LIVE plan nodes
 * into the two things this surface shows —
 *
 *   1. the preview: every route the commit will touch, marked `new` (will be
 *      created) or `in-plan` (already exists, will be skipped), and
 *   2. the readiness checklist: core coverage, per-family target vs planned,
 *      and the foundation requirements measured against the CMS.
 *
 * Nothing here fetches. The route arithmetic mirrors `plan._node_shape`
 * exactly (parent route + "/" + slug), so a row marked `new` is a row the DB
 * will accept and a row marked `in-plan` is a duplicate the commit skips.
 */
import type { PlanNodeRow } from "@/features/marketing/content-plan/types";

import {
  readArchetypeStamp,
  type ExpandedArchetype,
  type FoundationRequirement,
  type PlannedPage,
} from "./archetypes";
import { countAssetsFor, type CmsFoundationActuals, type FoundationState } from "./data";

export type RouteState = "new" | "in-plan";

export interface PreviewRow extends PlannedPage {
  state: RouteState;
  /** The live node occupying this route, when there is one. */
  existingNodeId: string | null;
}

export interface PreviewGroup {
  key: string;
  title: string;
  /** "Blog × 120 — hub only" style note for count-only families. */
  note: string | null;
  rows: PreviewRow[];
  newCount: number;
}

export interface Preview {
  groups: PreviewGroup[];
  total: number;
  newCount: number;
  existingCount: number;
}

/** Route index of the live plan — the authority for "does this already exist". */
export function indexByRoute(nodes: PlanNodeRow[]): Map<string, PlanNodeRow> {
  const map = new Map<string, PlanNodeRow>();
  for (const node of nodes) {
    if (node.route) map.set(node.route, node);
  }
  return map;
}

export function buildPreview(
  expanded: ExpandedArchetype,
  nodes: PlanNodeRow[],
): Preview {
  const byRoute = indexByRoute(nodes);
  const rowFor = (page: PlannedPage): PreviewRow => {
    const existing = byRoute.get(page.route) ?? null;
    return {
      ...page,
      state: existing ? "in-plan" : "new",
      existingNodeId: existing?.id ?? null,
    };
  };

  const coreRows = expanded.pages
    .filter((page) => page.role === "home" || page.role === "core")
    .map(rowFor);

  const groups: PreviewGroup[] = [
    {
      key: "core",
      title: "Core pages",
      note: null,
      rows: coreRows,
      newCount: coreRows.filter((row) => row.state === "new").length,
    },
  ];

  for (const family of expanded.families) {
    const rows = expanded.pages
      .filter((page) => page.familyKey === family.key)
      .map(rowFor);
    groups.push({
      key: family.key,
      title: `${family.label} × ${family.count}`,
      note:
        family.materialize === "count_only"
          ? `Hub only — the ${family.count} titles come from research, not a template.`
          : null,
      rows,
      newCount: rows.filter((row) => row.state === "new").length,
    });
  }

  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const newCount = groups.reduce((sum, group) => sum + group.newCount, 0);
  return { groups, total, newCount, existingCount: total - newCount };
}

// ─── readiness ───────────────────────────────────────────────────────────

export interface CoverageRow {
  key: string;
  label: string;
  route: string;
  target: number;
  planned: number;
  materialize: "pages" | "count_only";
}

export interface FoundationRow extends FoundationRequirement {
  actual: number;
  state: FoundationState;
  detail: string;
}

export interface Readiness {
  /** Core pages already in the plan, out of the archetype's core set. */
  coreMet: number;
  coreTotal: number;
  coreMissing: string[];
  families: CoverageRow[];
  foundation: FoundationRow[];
  foundationMet: number;
  foundationTotal: number;
  /** Live plan nodes on this site, whatever their origin. */
  planNodesLive: number;
}

function stateFor(required: number, actual: number): FoundationState {
  if (actual < 0) return "unknown";
  if (actual >= required) return "met";
  return actual > 0 ? "partial" : "unmet";
}

export function buildReadiness(
  expanded: ExpandedArchetype,
  nodes: PlanNodeRow[],
  cms: CmsFoundationActuals | null,
): Readiness {
  const byRoute = indexByRoute(nodes);

  const corePages = expanded.pages.filter(
    (page) => page.role === "home" || page.role === "core",
  );
  const coreMissing = corePages
    .filter((page) => !byRoute.has(page.route))
    .map((page) => page.label);

  const families: CoverageRow[] = expanded.families.map((family) => {
    const hubRoute = family.route;
    const prefix = `${hubRoute}/`;
    const planned = nodes.filter(
      (node) => node.route?.startsWith(prefix) ?? false,
    ).length;
    return {
      key: family.key,
      label: family.label,
      route: hubRoute,
      target: family.count,
      planned,
      materialize: family.materialize,
    };
  });

  const foundation: FoundationRow[] = expanded.foundation.map((item) => {
    if (!cms || !cms.linked) {
      // The reason is stated ONCE in the section header — repeating the same
      // sentence on every row is noise, not information.
      return {
        ...item,
        actual: -1,
        state: "unknown" as FoundationState,
        detail: item.declaredAs.startsWith("=") ? "" : "not measurable yet",
      };
    }
    let actual = 0;
    let detail = "";
    if (item.key === "tokens") {
      actual = cms.tokens;
      detail = cms.tokens > 0 ? "theme_config is set" : "theme_config is empty";
    } else if (item.key === "header") {
      actual = cms.header;
      detail = `${cms.header} active header component(s)`;
    } else if (item.key === "footer") {
      actual = cms.footer;
      detail = `${cms.footer} active footer component(s)`;
    } else if (item.key === "nav_entries") {
      actual = cms.navEntries;
      detail = cms.navDetail;
    } else if (item.key.startsWith("asset:")) {
      const assetKey = item.key.slice("asset:".length);
      actual = countAssetsFor(cms, assetKey);
      detail = `matched by tag / folder / filename "${assetKey}"`;
    }
    return { ...item, actual, state: stateFor(item.required, actual), detail };
  });

  return {
    coreMet: corePages.length - coreMissing.length,
    coreTotal: corePages.length,
    coreMissing,
    families,
    foundation,
    foundationMet: foundation.filter((row) => row.state === "met").length,
    foundationTotal: foundation.length,
    planNodesLive: nodes.length,
  };
}

// ─── the shape this plan was already committed to ────────────────────────

export interface CommittedShape {
  archetypeKey: string;
  counts: Record<string, number>;
}

/**
 * Read the committed shape back off `plan.node.attributes.archetype` — the
 * plan itself is the store, so the checklist survives reloads, other
 * sessions, and agent writes with no second source of truth.
 */
export function readCommittedShape(nodes: PlanNodeRow[]): CommittedShape | null {
  let archetypeKey: string | null = null;
  const counts: Record<string, number> = {};
  for (const node of nodes) {
    const stamp = readArchetypeStamp(node.attributes);
    if (!stamp) continue;
    archetypeKey ??= stamp.source;
    if (stamp.role === "family_hub" && stamp.family) {
      counts[stamp.family] = stamp.targetCount ?? 0;
    }
  }
  return archetypeKey ? { archetypeKey, counts } : null;
}
