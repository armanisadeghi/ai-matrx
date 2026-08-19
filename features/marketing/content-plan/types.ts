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
export type PlanNodeStepRow = Database["plan"]["Tables"]["node_step"]["Row"];
export type PlanNodeArtifactRow =
  Database["plan"]["Tables"]["node_artifact"]["Row"];

/**
 * The Website Factory pipeline axis (researched → written → reviewed → built →
 * published). Vocabulary mirror of aidream
 * `services/content_plan/artifacts.py` STEPS — the server is canonical; a
 * missing `plan.node_step` row means the step has never run.
 */
export const PIPELINE_STEPS = [
  {
    step: "p1_keywords",
    label: "SEO plan",
    what: "The search this page is meant to win — its target keyword, supporting keywords and meta text.",
  },
  {
    step: "p2_research",
    label: "Research",
    what: "The grounded brief this page is written from, and the sources behind it.",
  },
  {
    step: "p3_family",
    label: "Family",
    what: "What this page covers versus its sibling pages, so two pages never compete for the same search.",
  },
  {
    step: "p4_write",
    label: "Write",
    what: "The page's actual words, as editable sections you can change without touching code.",
  },
  {
    step: "p5_review",
    label: "Review",
    what: "The written content checked against the brief and the research.",
  },
  {
    step: "p6_build",
    label: "Build",
    what: "The real page on the website — whether it exists yet, and what to do about it.",
  },
  {
    step: "p7_publish",
    label: "Publish",
    what: "Whether the page is live, and what it is doing out there.",
  },
] as const;
export type PipelineStepKey = (typeof PIPELINE_STEPS)[number]["step"];

/**
 * The steps a human can run on ONE page from the rail
 * (`POST /content-plan/nodes/{id}/steps/{step}`, aidream `page_pipeline.py`).
 * The others have their own producers: keywords/research come from Deepen and
 * the Setup passes, build/publish from the CMS fill and publish jobs. Keep this
 * in lockstep with `RUNNABLE_STEPS` there — the server rejects anything else
 * with a 404 that names the valid set.
 */
export const RUNNABLE_PIPELINE_STEPS = [
  "p3_family",
  "p4_write",
  "p5_review",
] as const;
export type RunnablePipelineStep = (typeof RUNNABLE_PIPELINE_STEPS)[number];

/** What the button says, in the words of someone who has never heard of "p4". */
export const RUNNABLE_STEP_ACTIONS: Record<
  RunnablePipelineStep,
  { action: string; explains: string }
> = {
  p3_family: {
    action: "Decide coverage",
    explains:
      "Work out what this page covers and what belongs to its sibling pages, so two pages never compete for the same search.",
  },
  p4_write: {
    action: "Write content",
    explains:
      "Write the page's content as editable sections — headings and prose you can change without touching code.",
  },
  p5_review: {
    action: "Review + fact-check",
    explains:
      "Check the written content against the brief and the research, then fix what it finds.",
  },
};

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

/**
 * plan.entity holds CITATIONS only. Person/org rows folded into `crm.party`
 * (2026-08-12; guard trigger `plan._entity_kind_guard` rejects new ones) —
 * people and organizations on a site's roster are crm parties linked via a
 * `party → web_site` association edge with role `writes_for`.
 */
export type PlanEntityType = "source" | "media";
export const PLAN_ENTITY_TYPES: readonly PlanEntityType[] = ["source", "media"];

/** The `party → web_site` role that puts a person/company on a site's roster. */
export const PARTY_SITE_ROLE = "writes_for";

// Category dimensions live in the CANONICAL registry —
// `CATEGORY_DIMENSIONS.planPageType|planStatus|planPersonRole|planSourceType`
// in features/scopes/categoryDimensions.ts. No local copy.

/** Association roles registered for plan pairs (platform.association_types). */
export const PLAN_NODE_TOPIC_ROLE = "topic";
/** Roles on plan_node → plan_entity edges (source/media citations). */
export const PLAN_NODE_SOURCE_ROLES = ["about", "cites", "embeds"] as const;
/** Roles on plan_node → party edges (people/companies; registered pair). */
export const PLAN_NODE_PARTY_ROLES = [
  "about",
  "cites",
  "authored_by",
  "reviewed_by",
] as const;
export type PlanNodeEntityRole =
  | (typeof PLAN_NODE_SOURCE_ROLES)[number]
  | (typeof PLAN_NODE_PARTY_ROLES)[number];

/** Edge payload kind carried on `reviewed_by` edges (platform.edge_payload_kind). */
export const PLAN_REVIEW_PAYLOAD_KIND = "plan_review";
export interface PlanReviewPayload {
  review_date: string; // ISO date, required by the DB json schema
  notes?: string;
}

/** Entity tokens (platform.association_types source/target types). */
export const PLAN_NODE_TOKEN = "plan_node";
export const PLAN_ENTITY_TOKEN = "plan_entity";
export const PARTY_TOKEN = "party";
export const WEB_SITE_TOKEN = "web_site";
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
