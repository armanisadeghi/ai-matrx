/**
 * Items for the `plan_tree` and `plan_node_patch` output_directive envelopes
 * (Content Planning — cross-repo SoR common-docs/systems/content-planning/
 * FEATURE.md). Mirrors aidream's PlanTreeItem / PlanNodePatchItem
 * (services/content_plan/directives.py; the generated manifest in
 * docs/protocol/matrx_envelope_registry.generated.json is canonical).
 * Derived plan.node cache fields (route/depth/pillar/cluster labels) are
 * deliberately absent — the DB trigger owns them.
 */

export interface PlanSourceSpec {
  label: string;
  url?: string | null;
  source_type?: string | null;
  notes?: string | null;
}

export interface PlanTreeNodeSpec {
  label: string;
  node_type: "home" | "pillar" | "cluster" | "article" | "index";
  slug?: string | null;
  status?: string | null;
  page_type?: string | null;
  priority?: number | null;
  technical_depth?: string | null;
  needs_reviewer?: boolean;
  brief?: string[];
  attributes?: Record<string, unknown>;
  primary_keyword_id?: string | null;
  primary_keyword_phrase?: string | null;
  topics?: string[];
  sources?: PlanSourceSpec[];
  children?: PlanTreeNodeSpec[];
}

export interface PlanTreeDirectiveItem {
  site_id: string;
  default_status?: string | null;
  nodes: PlanTreeNodeSpec[];
}

export interface PlanNodePatchItem {
  node_id?: string | null;
  site_id?: string | null;
  route?: string | null;
  label?: string | null;
  slug?: string | null;
  node_type?: string | null;
  parent_id?: string | null;
  status?: string | null;
  page_type?: string | null;
  priority?: number | null;
  technical_depth?: string | null;
  needs_reviewer?: boolean | null;
  brief?: string[] | null;
  attributes?: Record<string, unknown> | null;
  primary_keyword_id?: string | null;
}

/** Count every node in a spec tree (pure). */
export function countSpecNodes(nodes: PlanTreeNodeSpec[]): number {
  let total = 0;
  for (const node of nodes) {
    total += 1 + countSpecNodes(node.children ?? []);
  }
  return total;
}

export interface ResolvedPlanTree {
  siteId: string;
  /** Live plan.node rows whose slugs match the spec (proof of apply). */
  matchedCount: number;
  /** Total live nodes on the site after apply. */
  liveCount: number;
  /** Top-level spec nodes resolved to their live routes (when found). */
  topLevel: { label: string; route: string | null }[];
}

export type ResolveStatus = "idle" | "polling" | "resolved" | "exhausted";
