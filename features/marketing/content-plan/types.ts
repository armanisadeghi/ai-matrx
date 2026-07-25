/**
 * features/marketing/content-plan/types.ts
 *
 * Row types for the `plan` schema (Content Planning — see
 * common-docs/systems/content-planning/FEATURE.md, the cross-repo system of
 * record) plus the client-side view models. Everything derives from the
 * generated `Database["plan"]` types — never hand-mirrored.
 */
import type { Database } from "@/types/database.types";

export type PlanNodeRow = Database["plan"]["Tables"]["node"]["Row"];
export type PlanEntityRow = Database["plan"]["Tables"]["entity"]["Row"];
export type PlanProfileRow = Database["plan"]["Tables"]["profile"]["Row"];

/**
 * Columns on plan.node that are TRIGGER-OWNED derived cache
 * (`plan._node_shape` computes them; `_z_node_cascade` propagates). Clients
 * read them, never write them — sending one in an insert/update payload is a
 * platform defect (content-planning invariant #3).
 */
export const PLAN_NODE_TRIGGER_OWNED = [
  "route",
  "depth",
  "pillar_label",
  "cluster_label",
] as const;
export type PlanNodeTriggerOwned = (typeof PLAN_NODE_TRIGGER_OWNED)[number];

/**
 * Insert payload with the trigger-owned + system-stamped columns forbidden.
 * `organization_id` stays REQUIRED and is passed from the site row the node
 * belongs to — the DB guard (`plan._require_branded_site`) raises loudly on
 * any mismatch, so the client can never smuggle a wrong org through.
 */
export type PlanNodeInsert = Omit<
  Database["plan"]["Tables"]["node"]["Insert"],
  | PlanNodeTriggerOwned
  | "created_by"
  | "updated_by"
  | "created_at"
  | "updated_at"
  | "version"
>;

/** Update payload — same forbidden set, plus identity/site/org are immutable here. */
export type PlanNodeUpdate = Partial<
  Omit<PlanNodeInsert, "id" | "site_id" | "organization_id">
>;

export type PlanEntityInsert = Omit<
  Database["plan"]["Tables"]["entity"]["Insert"],
  "created_by" | "updated_by" | "created_at" | "updated_at" | "version"
>;
export type PlanEntityUpdate = Partial<
  Omit<PlanEntityInsert, "id" | "site_id" | "organization_id">
>;

export type PlanNodeType = "home" | "pillar" | "cluster" | "article" | "index";
export const PLAN_NODE_TYPES: readonly PlanNodeType[] = [
  "home",
  "pillar",
  "cluster",
  "article",
  "index",
];

export type TechnicalDepth = "low" | "medium" | "high";
export const TECHNICAL_DEPTHS: readonly TechnicalDepth[] = [
  "low",
  "medium",
  "high",
];

export type PlanEntityType = "person" | "source" | "media" | "org";
export const PLAN_ENTITY_TYPES: readonly PlanEntityType[] = [
  "person",
  "source",
  "media",
  "org",
];

// Category dimensions live in the CANONICAL registry —
// `CATEGORY_DIMENSIONS.planPageType|planStatus|planPersonRole|planSourceType`
// in features/scopes/categoryDimensions.ts. No local copy.

/** Association roles registered for plan pairs (platform.association_types). */
export const PLAN_NODE_TOPIC_ROLE = "topic";
export const PLAN_NODE_SECONDARY_KEYWORD_ROLE = "secondary_keyword";
export const PLAN_NODE_ENTITY_ROLES = [
  "about",
  "cites",
  "embeds",
  "authored_by",
  "reviewed_by",
] as const;
export type PlanNodeEntityRole = (typeof PLAN_NODE_ENTITY_ROLES)[number];

/** Edge payload kind carried on `reviewed_by` edges (platform.edge_payload_kind). */
export const PLAN_REVIEW_PAYLOAD_KIND = "plan_review";
export interface PlanReviewPayload {
  review_date: string; // ISO date, required by the DB json schema
  notes?: string;
}

/** Entity tokens (platform.association_types source/target types). */
export const PLAN_NODE_TOKEN = "plan_node";
export const PLAN_ENTITY_TOKEN = "plan_entity";
export const SEO_TOPIC_TOKEN = "seo_topic";
export const SEO_KEYWORD_TOKEN = "seo_keyword";

/** A plan.node with its children resolved — the tree view model. */
export interface PlanNodeTreeItem {
  node: PlanNodeRow;
  children: PlanNodeTreeItem[];
}

/** Build the parent/child tree from a flat site node list (pure). */
export function buildPlanTree(rows: PlanNodeRow[]): PlanNodeTreeItem[] {
  const byId = new Map<string, PlanNodeTreeItem>();
  for (const node of rows) byId.set(node.id, { node, children: [] });
  const roots: PlanNodeTreeItem[] = [];
  for (const item of byId.values()) {
    const parent = item.node.parent_id
      ? byId.get(item.node.parent_id)
      : undefined;
    if (parent) parent.children.push(item);
    else roots.push(item);
  }
  const byPosition = (a: PlanNodeTreeItem, b: PlanNodeTreeItem) =>
    (a.node.route ?? "").localeCompare(b.node.route ?? "") ||
    a.node.label.localeCompare(b.node.label);
  const sortDeep = (items: PlanNodeTreeItem[]) => {
    items.sort(byPosition);
    for (const item of items) sortDeep(item.children);
  };
  sortDeep(roots);
  return roots;
}
