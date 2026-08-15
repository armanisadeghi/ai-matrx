/**
 * features/marketing/content-plan/format.ts
 *
 * The ONE place Content Plan surfaces turn their rows into human-readable
 * summaries and their pages into the KPI block every payload must carry.
 *
 * Doctrine (`components/agent-copy`): a `human` summary is written once and
 * reused by the row, the list, the record and the whole-page payload — never
 * duplicated per callsite. The agent envelope comes from
 * `features/marketing/lib/copy-payloads.ts` (`webCopy` / `webLocation` /
 * `humanLines`); this file only supplies the words and the numbers.
 *
 * 🚨 THE WHAT-I-SEE LAW. `contentPlanKpis` mirrors the numbers the workspace
 * LEADS with — the website bar's built/live counts and the drift bar's
 * ghost/conflict/orphan counts — verbatim, so a copied payload and the screen
 * can never disagree, and an agent never recomputes what the user already
 * sees. Same vocabulary as the `content-plan` surface scope, so a payload and
 * the surface's declared values never mean different things by one name.
 */

import type { PlanDriftModel, DriftItem } from "./lib/drift";
import type { PlanAiRunSummary } from "./hooks/usePlanAiRuns";
import type { PlanSiteStats } from "./data/service";
import type { RealityVerdict } from "./lib/page-reality";
import type { PlanEntityRow, PlanNodeRow } from "./types";

/** The workspace's leading metric strip, as data. */
export interface ContentPlanKpis {
  pages_planned: number;
  pages_built: number | null;
  pages_live: number | null;
  pages_on_site_not_planned: number | null;
  drift_total: number;
  drift_ghosts: number;
  drift_conflicts: number;
  drift_orphans: number;
  /** No paired website / no crawl = the drift numbers mean "not comparable". */
  drift_comparable: boolean;
}

export function contentPlanKpis(input: {
  plannedCount: number;
  builtCount?: number | null;
  liveCount?: number | null;
  unplannedCount?: number | null;
  drift: PlanDriftModel;
}): ContentPlanKpis {
  return {
    pages_planned: input.plannedCount,
    pages_built: input.builtCount ?? null,
    pages_live: input.liveCount ?? null,
    pages_on_site_not_planned: input.unplannedCount ?? null,
    drift_total: input.drift.counts.total,
    drift_ghosts: input.drift.counts.ghosts,
    drift_conflicts: input.drift.counts.conflicts,
    drift_orphans: input.drift.counts.orphans,
    drift_comparable: input.drift.isPaired || input.drift.hasCrawlData,
  };
}

/** The KPI strip as the sentence the bars render — for `human` copy. */
export function contentPlanKpiLine(kpis: ContentPlanKpis): string {
  const parts = [`${kpis.pages_planned} pages planned`];
  if (kpis.pages_built !== null) {
    parts.push(`${kpis.pages_built} built`);
  }
  if (kpis.pages_live !== null) parts.push(`${kpis.pages_live} live`);
  if (kpis.pages_on_site_not_planned) {
    parts.push(
      `${kpis.pages_on_site_not_planned} on the site the plan does not describe`,
    );
  }
  if (!kpis.drift_comparable) {
    parts.push("no connected website yet — drift not comparable");
  } else if (kpis.drift_total === 0) {
    parts.push("the plan matches the live site");
  } else {
    parts.push(
      `${kpis.drift_total} differences (${kpis.drift_ghosts} not live · ${kpis.drift_conflicts} route conflicts · ${kpis.drift_orphans} not in the plan)`,
    );
  }
  return parts.join(" · ");
}

/** One plan node, the way the tree and the table render it. */
export function planNodeSummary(node: PlanNodeRow): string {
  const bits = [
    node.route ?? "(no route yet)",
    node.node_type,
    node.priority != null ? `priority ${node.priority}` : null,
    node.primary_keyword_id ? null : "no target keyword",
    node.brief && node.brief.length > 0
      ? `${node.brief.length} brief point${node.brief.length === 1 ? "" : "s"}`
      : "no brief",
    node.needs_reviewer ? "needs reviewer" : null,
  ].filter(Boolean);
  return `${node.label} — ${bits.join(" · ")}`;
}

/** A plan node projected to the fields a reader actually needs. */
export function planNodeKeyFields(node: PlanNodeRow) {
  return {
    id: node.id,
    label: node.label,
    route: node.route,
    node_type: node.node_type,
    status_id: node.status_id,
    priority: node.priority,
    depth: node.depth,
    pillar_label: node.pillar_label,
    cluster_label: node.cluster_label,
    primary_keyword_id: node.primary_keyword_id,
    has_brief: Boolean(node.brief && node.brief.length > 0),
    brief_points: node.brief?.length ?? 0,
    needs_reviewer: node.needs_reviewer,
    meta_title: node.meta_title,
    meta_description: node.meta_description,
    updated_at: node.updated_at,
  };
}

/** One site row on the Content Plan list page. */
export function planSiteSummary(input: {
  name: string | null;
  domain: string | null;
  stats: PlanSiteStats | null;
}): string {
  const label = input.domain ?? input.name ?? "(unnamed site)";
  if (!input.stats || input.stats.totalNodes === 0) {
    return `${label} — no plan yet`;
  }
  return `${label} — ${input.stats.totalNodes} pages planned · ${input.stats.keywordBound}/${input.stats.totalNodes} with a target keyword`;
}

/**
 * The FULL status mix for a site, named not id'd. The table cell renders only
 * the top four chips, so every copy/export path must carry all of them —
 * a truncated view is never allowed to become a truncated payload.
 */
export function planSiteStatusMix(
  stats: PlanSiteStats | null,
  statusName: (statusId: string) => string,
): Array<{ status: string; count: number }> {
  if (!stats) return [];
  return Object.entries(stats.byStatusId)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([statusId, count]) => ({
      status: statusId ? statusName(statusId) : "No status",
      count,
    }));
}

/** One drift row, as the sheet states it. */
export function driftItemSummary(item: DriftItem): string {
  return `[${item.kind}/${item.severity}] ${item.title} — ${item.verdict}`;
}

/** A drift row flattened for CSV — every kind through one column set. */
export function driftItemCsvRow(item: DriftItem): Record<string, unknown> {
  return {
    kind: item.kind,
    severity: item.severity,
    title: item.title,
    verdict: item.verdict,
    node_id: "nodeId" in item ? item.nodeId : "",
    route:
      "route" in item
        ? item.route
        : "nodeRoute" in item
          ? item.nodeRoute
          : "",
    live_url: "liveUrl" in item ? (item.liveUrl ?? "") : "",
    url: "url" in item ? (item.url ?? "") : "",
  };
}

/** One recorded AI run, as the runs view renders it. */
export function planAiRunSummary(run: PlanAiRunSummary): string {
  const cost = run.totalCost
    ? run.totalCost < 0.01
      ? "<$0.01"
      : `$${run.totalCost.toFixed(2)}`
    : "";
  return [
    `${run.kindLabel} — ${run.status || "unknown"}`,
    run.nodeRoute || null,
    run.error || run.headline || null,
    [cost, run.createdAt].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * One E-E-A-T source/media row, as the roster renders it: the type chip and
 * the label. `plan.entity` carries no url/notes columns — anything else a
 * source knows about itself lives in `attributes`, which rides the JSON
 * flavor rather than being re-derived into words here.
 */
export function planEntitySummary(entity: PlanEntityRow): string {
  return `${entity.entity_type}: ${entity.label}`;
}

/** The node's real-page verdict, as the card states it. */
export function realityVerdictSummary(verdict: RealityVerdict): string {
  return verdict.action
    ? `${verdict.headline} → ${verdict.actionLabel}`
    : verdict.headline;
}
