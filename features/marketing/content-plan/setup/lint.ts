/**
 * features/marketing/content-plan/setup/lint.ts
 *
 * Plan structure lint — the whole-tree pre-flight (work-order item: problems
 * must surface as ONE report before realize, not one-by-one during
 * reconcile). PURE functions over the already-loaded live nodes; nothing here
 * fetches. The DB triggers remain the write-time authority — this reads what
 * actually landed (agent writes included) and names anything that will bite
 * during realize/publish.
 *
 * Severity contract:
 *  - error   — will break or corrupt the plan→CMS run (fix before realize).
 *  - warning — legal but almost certainly wrong; review before realize.
 *  - info    — coverage gaps that make generated content worse, not broken.
 *
 * An aidream `content_plan validate` twin can adopt these rules server-side;
 * if it does, pin both with a shared fixture (archetype-twin pattern).
 */
import type { PlanNodeRow } from "../types";

export type LintSeverity = "error" | "warning" | "info";

export interface LintFinding {
  key: string;
  severity: LintSeverity;
  label: string;
  /** Offending routes (or labels when a route is missing), capped by caller. */
  routes: string[];
  count: number;
}

export interface PlanLintReport {
  findings: LintFinding[];
  errors: number;
  warnings: number;
  infos: number;
  nodesChecked: number;
}

const SLUG_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Content-bearing types — the ones realize turns into CMS pages that need briefs. */
const CONTENT_TYPES = new Set(["article", "cluster", "pillar"]);

function routeOrLabel(node: PlanNodeRow): string {
  return node.route ?? `(no route) ${node.label}`;
}

export function lintPlan(nodes: readonly PlanNodeRow[]): PlanLintReport {
  const findings: LintFinding[] = [];
  const byId = new Map(nodes.map((node) => [node.id, node]));

  const push = (
    key: string,
    severity: LintSeverity,
    label: string,
    offenders: PlanNodeRow[],
  ) => {
    if (offenders.length === 0) return;
    findings.push({
      key,
      severity,
      label,
      routes: offenders.map(routeOrLabel),
      count: offenders.length,
    });
  };

  // Home page: exactly one. Missing = nothing to publish at "/"; multiple =
  // two nodes fighting for the CMS's single-home slot.
  const homes = nodes.filter((node) => node.node_type === "home");
  if (homes.length === 0 && nodes.length > 0) {
    findings.push({
      key: "home-missing",
      severity: "error",
      label: "No home page — the site has nothing at /",
      routes: [],
      count: 1,
    });
  }
  push(
    "home-multiple",
    "error",
    "More than one home page — the CMS allows exactly one",
    homes.length > 1 ? homes : [],
  );

  // Orphans: a parent_id pointing at nothing live. The service refuses to
  // delete a node with children, but agent/bulk paths have produced these.
  push(
    "orphans",
    "error",
    "Orphaned pages — their parent no longer exists",
    nodes.filter((node) => node.parent_id !== null && !byId.has(node.parent_id)),
  );

  // Slug shape: the trigger enforces kebab-case on write, but legacy rows and
  // tool writes predating the guard can violate it; realize would emit an
  // ugly or rejected CMS slug.
  push(
    "bad-slug",
    "warning",
    "Slug is not kebab-case",
    nodes.filter((node) => node.slug !== null && !SLUG_SHAPE.test(node.slug)),
  );

  // Missing route: the trigger owns routes; a null route on a live row means
  // the cascade never ran — a data anomaly worth seeing.
  push(
    "no-route",
    "warning",
    "No computed route (trigger cascade never ran)",
    nodes.filter((node) => node.route === null),
  );

  // Duplicate sibling labels: identity is (parent, slug) so these are legal,
  // but two "Services" under one parent is almost always an authoring slip.
  const siblingLabelMap = new Map<string, PlanNodeRow[]>();
  for (const node of nodes) {
    const key = `${node.parent_id ?? "root"}::${node.label.trim().toLowerCase()}`;
    const bucket = siblingLabelMap.get(key);
    if (bucket) bucket.push(node);
    else siblingLabelMap.set(key, [node]);
  }
  push(
    "duplicate-labels",
    "warning",
    "Siblings sharing the same label",
    Array.from(siblingLabelMap.values())
      .filter((bucket) => bucket.length > 1)
      .flat(),
  );

  // Coverage gaps — these decide how good generated content can be.
  push(
    "no-brief",
    "info",
    "Content pages with no brief (generation will have nothing to work from)",
    nodes.filter(
      (node) => CONTENT_TYPES.has(node.node_type) && node.brief.length === 0,
    ),
  );
  push(
    "no-keyword",
    "info",
    "Content pages with no primary keyword",
    nodes.filter(
      (node) =>
        CONTENT_TYPES.has(node.node_type) && node.primary_keyword_id === null,
    ),
  );

  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const infos = findings.filter((f) => f.severity === "info").length;
  return { findings, errors, warnings, infos, nodesChecked: nodes.length };
}
