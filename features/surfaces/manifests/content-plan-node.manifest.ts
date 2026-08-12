/**
 * Surface manifest — Content Plan Node (`matrx-user/content-plan-node`).
 *
 * The "step inside" surface for ONE plan node: while the node panel is open
 * (inline in the tree view, or as the right sheet on table/map/mobile), this
 * surface is the deepest registered runtime and its context is the node's
 * PARTS — the draft-overlaid editable fields the user is looking at — not the
 * node as a whole (that composite lives on the parent workspace surface as
 * `selected_node`).
 *
 * FIRST READ/WRITE SURFACE: beside its values it declares `writeTargets` —
 * the fields an agent result (via the `apply_surface_write` kind action or an
 * automated apply) may write back into the panel. Field targets are
 * `mode: "draft"`: they stage into the panel's draft for the user to review
 * and save — never a silent DB write. `save_node` is the one entity-mode
 * target (equivalent to the user pressing Save).
 *
 * Runtime emitter + write handlers: `NodePanel.tsx` mounts a nested
 * `SurfaceRuntimeProvider` (deepest wins while the panel is open).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "node_identity",
    label: "Node identity",
    sortOrder: 100,
    description: "Which planned page this is — id, label, slug, route.",
  },
  {
    key: "node_placement",
    label: "Placement",
    sortOrder: 200,
    description:
      "Where the node sits in the tree — parent, depth, pillar/cluster (DB-derived).",
  },
  {
    key: "node_targeting",
    label: "Targeting",
    sortOrder: 300,
    description:
      "Type, status, priority, technical depth, reviewer flag, primary keyword.",
  },
  {
    key: "node_content",
    label: "Content",
    sortOrder: 400,
    description: "The brief and the vertical attributes.",
  },
  {
    key: "node_state",
    label: "Editor state",
    sortOrder: 500,
    description: "Live panel state — unsaved edits.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Node identity (100-199) ───────────────────────────────────────────
  {
    name: "node_id",
    label: "Node ID",
    description:
      "UUID of the plan node open in the panel. Always present while this surface is active.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 100,
    group: "node_identity",
  },
  {
    name: "node_label",
    label: "Node label",
    description:
      "The node's display label as currently shown in the panel — the user's unsaved draft when one exists, otherwise the saved value.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    sortOrder: 110,
    group: "node_identity",
  },
  {
    name: "node_slug",
    label: "Node slug",
    description:
      "URL slug (draft-overlaid). Empty for the home/root node, which has no slug.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    sortOrder: 120,
    group: "node_identity",
  },
  {
    name: "node_route",
    label: "Node route",
    description:
      "The SAVED full route, computed by database triggers — observed evidence, never write or recompute it. Empty on a node whose route has not been derived yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 130,
    group: "node_identity",
  },

  // ── Placement (200-299) ───────────────────────────────────────────────
  {
    name: "node_parent_id",
    label: "Parent node ID",
    description: "UUID of the parent node. Empty on a top-level node.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 200,
    group: "node_placement",
    autoContext: false,
  },
  {
    name: "node_depth",
    label: "Node depth",
    description:
      "DB-derived depth in the tree (trigger-owned cache). Empty while the row has not been recomputed.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 210,
    group: "node_placement",
    autoContext: false,
  },
  {
    name: "node_pillar_label",
    label: "Pillar label",
    description:
      "DB-derived pillar this node belongs to (trigger-owned cache). Empty on pillar-level and root nodes.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 220,
    group: "node_placement",
    autoContext: false,
  },
  {
    name: "node_cluster_label",
    label: "Cluster label",
    description:
      "DB-derived cluster this node belongs to (trigger-owned cache). Empty above cluster depth.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 230,
    group: "node_placement",
    autoContext: false,
  },

  // ── Targeting (300-399) ───────────────────────────────────────────────
  {
    name: "node_type",
    label: "Node type",
    description:
      "Structural type of the planned page (draft-overlaid): home, pillar, cluster, article, service, location, utility.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 300,
    group: "node_targeting",
  },
  {
    name: "node_page_type_id",
    label: "Page type ID",
    description:
      "`plan_page_type` category UUID (draft-overlaid). Empty when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 310,
    group: "node_targeting",
    autoContext: false,
  },
  {
    name: "node_status_id",
    label: "Status ID",
    description:
      "`plan_status` category UUID (draft-overlaid; the parent surface's status_options maps ids to slugs). Empty when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 320,
    group: "node_targeting",
  },
  {
    name: "node_priority",
    label: "Priority",
    description:
      "Numeric priority (draft-overlaid; higher = more important). Empty when unset.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 330,
    group: "node_targeting",
  },
  {
    name: "node_technical_depth",
    label: "Technical depth",
    description:
      "Editorial difficulty tier (draft-overlaid): foundational | intermediate | advanced. Empty when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 340,
    group: "node_targeting",
  },
  {
    name: "node_needs_reviewer",
    label: "Needs reviewer",
    description:
      "Whether this node is flagged as requiring an expert reviewer (draft-overlaid). Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 350,
    group: "node_targeting",
  },
  {
    name: "node_primary_keyword_id",
    label: "Primary keyword ID",
    description:
      "`seo.keyword` UUID bound as THE primary keyword (draft-overlaid; a column, never an association edge). Empty when no keyword is bound.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 360,
    group: "node_targeting",
  },

  // ── Content (400-499) ─────────────────────────────────────────────────
  {
    name: "node_brief",
    label: "Node brief",
    description:
      "The brief as an array of bullet-point strings, exactly as shown in the panel (draft-overlaid — includes unsaved typing). Empty when the brief is empty.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 400,
    group: "node_content",
  },
  {
    name: "node_attributes",
    label: "Vertical attributes",
    description:
      "Schema-driven vertical attribute values (draft-overlaid JSONB object, shaped by the org's plan.profile). Empty when none are set.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 410,
    group: "node_content",
  },

  // ── Editor state (500-599) ────────────────────────────────────────────
  {
    name: "has_unsaved_edits",
    label: "Has unsaved edits",
    description:
      "True while the panel holds a draft the user has not saved. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 500,
    group: "node_state",
  },
  {
    name: "node_updated_at",
    label: "Last saved at",
    description:
      "ISO timestamp of the node's last SAVED change. Empty only if the row predates the column.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 27,
    sortOrder: 510,
    group: "node_state",
    autoContext: false,
  },
];

/**
 * The WRITE half — what an agent result may put back into this panel. Field
 * targets stage into the DRAFT (the user reviews and saves; the panel's Save
 * button and DB triggers stay the single persistence path). `save_node` is
 * the only entity-mode target.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "node_label",
    label: "Node label",
    description:
      "Stages a new display label into the panel draft. String; the user saves.",
    valueType: "string",
    updatesValue: "node_label",
    mode: "draft",
    group: "node_identity",
    sortOrder: 100,
  },
  {
    name: "node_slug",
    label: "Node slug",
    description:
      "Stages a new URL slug into the draft. Kebab-case string; the DB slug-shape trigger is the authority at save time.",
    valueType: "string",
    updatesValue: "node_slug",
    mode: "draft",
    group: "node_identity",
    sortOrder: 110,
  },
  {
    name: "node_type",
    label: "Node type",
    description:
      "Stages a structural type change (home | pillar | cluster | article | service | location | utility) into the draft.",
    valueType: "string",
    updatesValue: "node_type",
    mode: "draft",
    group: "node_targeting",
    sortOrder: 300,
  },
  {
    name: "node_status_id",
    label: "Status",
    description:
      "Stages a `plan_status` category UUID into the draft (map slugs to ids via the parent surface's status_options).",
    valueType: "string",
    updatesValue: "node_status_id",
    mode: "draft",
    group: "node_targeting",
    sortOrder: 310,
  },
  {
    name: "node_priority",
    label: "Priority",
    description: "Stages a numeric priority into the draft.",
    valueType: "number",
    updatesValue: "node_priority",
    mode: "draft",
    group: "node_targeting",
    sortOrder: 320,
  },
  {
    name: "node_technical_depth",
    label: "Technical depth",
    description:
      "Stages foundational | intermediate | advanced (or null to clear) into the draft.",
    valueType: "string",
    updatesValue: "node_technical_depth",
    mode: "draft",
    group: "node_targeting",
    sortOrder: 330,
  },
  {
    name: "node_needs_reviewer",
    label: "Needs reviewer",
    description: "Stages the reviewer flag (boolean) into the draft.",
    valueType: "boolean",
    updatesValue: "node_needs_reviewer",
    mode: "draft",
    group: "node_targeting",
    sortOrder: 340,
  },
  {
    name: "node_primary_keyword_id",
    label: "Primary keyword",
    description:
      "Stages a `seo.keyword` UUID (or null to unbind) as the primary keyword into the draft.",
    valueType: "string",
    updatesValue: "node_primary_keyword_id",
    mode: "draft",
    group: "node_targeting",
    sortOrder: 350,
  },
  {
    name: "node_brief",
    label: "Node brief",
    description:
      "Stages a full replacement brief into the draft as an array of bullet-point strings.",
    valueType: "array",
    updatesValue: "node_brief",
    mode: "draft",
    group: "node_content",
    sortOrder: 400,
  },
  {
    name: "node_attributes",
    label: "Vertical attributes",
    description:
      "Stages a full replacement vertical-attributes object into the draft.",
    valueType: "object",
    updatesValue: "node_attributes",
    mode: "draft",
    group: "node_content",
    sortOrder: 410,
  },
  {
    name: "save_node",
    label: "Save node",
    description:
      "Persists the panel's current draft through the canonical plan write path — equivalent to the user pressing Save. Value is ignored. DB trigger errors surface verbatim.",
    valueType: "boolean",
    mode: "entity",
    group: "node_state",
    sortOrder: 500,
  },
];

export const contentPlanNodeManifest: SurfaceManifest = {
  surfaceName: "matrx-user/content-plan-node",
  label: "Content Plan Node",
  readiness: "partial",
  readinessNote:
    "Emitter + write handlers wired in NodePanel; brief_writer has a default agent bound (the panel's Draft brief button runs it); write targets are not yet mirrored to the DB (code-only v1).",
  urlPattern: "/marketing/content-plan/[siteId]",
  inheritsFrom: "matrx-user/content-plan",
  intro: `<surface_intro>
You are inside the editor panel for ONE planned page of the site's content plan. The values here are the node's PARTS as the user currently sees them — draft-overlaid: unsaved edits are included, and has_unsaved_edits tells you when the panel differs from the saved row.
This surface can be WRITTEN TO. Its write targets mirror the editable fields: writes stage into the user's draft for review (never a silent save), except save_node, which persists the draft through the canonical write path. Prefer proposing staged field writes and let the user save.
Hard rules: node_route, node_depth, node_pillar_label, and node_cluster_label are computed by database triggers — read-only evidence. The primary keyword is a column (node_primary_keyword_id), secondary keywords are association edges on the parent surface's selected_node_edges. Slug shape, duplicate routes, and cross-site parents are rejected by the DB with exact messages — expect and relay them rather than pre-validating loosely.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
  agentRoles: [
    {
      name: "brief_writer",
      label: "Brief writer",
      description:
        "Deepens THIS node's brief — concrete bullet points grounded in its keyword, topics, and place in the tree. Result can stage straight into the panel via the node_brief write target.",
      kind: "single",
      // Platform agent "Content Plan Brief Writer" (agx, 2026-07-30) — the
      // panel's "Draft brief" button. NOT a duplicate of Deepen: Deepen is
      // aidream's pipeline that writes the brief AND attaches cited sources
      // immediately, while this STAGES a brief into the panel draft for the
      // user to review and save — the behaviour the `node_brief` draft write
      // target was declared for.
      // NEIGHBOUR-AWARE: it reads the page's parent, siblings and children so
      // a sibling's subject lands in `must_not_cover` instead of being written
      // twice. Same id the panel's button runs (setup/ai.ts).
      defaultAgentId: "711d29b5-0afc-494c-a665-6011e529efce",
      sortOrder: 100,
    },
  ],
};

/**
 * Type-safe payload helper — required keys are the inherited guarantee
 * (`view`, from matrx-user/content-plan) plus every own `alwaysAvailable:
 * true` value. Assembled directly in `NodePanel.tsx` (simple surface — the
 * panel's props/draft ARE the raw data).
 */
export function createContentPlanNodeScope(values: {
  // Inherited guarantee (parent's alwaysAvailable) → required
  view: "tree" | "table" | "map" | "entities" | "setup";
  // Own alwaysAvailable: true → required
  node_id: string;
  node_label: string;
  node_type: string;
  node_needs_reviewer: boolean;
  has_unsaved_edits: boolean;
  // Optional
  node_slug?: string;
  node_route?: string;
  node_parent_id?: string;
  node_depth?: number;
  node_pillar_label?: string;
  node_cluster_label?: string;
  node_page_type_id?: string;
  node_status_id?: string;
  node_priority?: number;
  node_technical_depth?: string;
  node_primary_keyword_id?: string;
  node_brief?: string[];
  node_attributes?: Record<string, unknown>;
  node_updated_at?: string;
  // Inherited optionals worth passing through when the host has them
  site_id?: string;
  site_domain?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
