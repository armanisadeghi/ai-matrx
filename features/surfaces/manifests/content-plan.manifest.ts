/**
 * Surface manifest — Content Plan workspace (`matrx-user/content-plan`).
 *
 * Drives `/marketing/content-plan/[siteId]?view=tree|table|map|entities|setup` — the
 * client workspace for the `plan` schema (`features/marketing/content-plan`): every URL
 * a site *should* have, as an editable tree (pillars → clusters → articles)
 * with briefs, keyword bindings, topics, and the people/sources behind the
 * content (E-E-A-T). `route` / `depth` / `pillar_label` / `cluster_label` on
 * every node are TRIGGER-OWNED derived cache — observed evidence an agent
 * reads as-is and never recomputes. Site identity is a routed path segment
 * since 2026-07-28 (the list page at /marketing/content-plan is the front
 * door); the workspace always has a site, but the runtime emitter still
 * treats site-derived values as best-effort while queries hydrate.
 *
 * Runtime emitter: `features/marketing/content-plan/lib/content-plan-scope.ts`
 * (`buildContentPlanScope`), mounted via `SurfaceRuntimeProvider` in
 * `features/marketing/content-plan/components/ContentPlanWorkbench.tsx`.
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
    key: "plan_site",
    label: "Planned site",
    sortOrder: 100,
    description: "Which managed website this plan belongs to.",
  },
  {
    key: "plan_workspace",
    label: "Workspace state",
    sortOrder: 200,
    description: "What the user is looking at right now — view and selection.",
  },
  {
    key: "plan_shape",
    label: "Plan shape",
    sortOrder: 300,
    description:
      "The whole plan tree and its status picture — DB-derived routes and labels included.",
  },
  {
    key: "plan_node",
    label: "Selected node",
    sortOrder: 400,
    description: "Full detail of the plan node the user has open.",
  },
  {
    key: "plan_people",
    label: "Entities and profiles",
    sortOrder: 500,
    description:
      "The site's E-E-A-T entities (people/sources) and the org's vertical profiles.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Planned site (300-349) ────────────────────────────────────────────
  {
    name: "site_id",
    label: "Site ID",
    description:
      "UUID of the `web.site` whose plan is open (the routed /marketing/content-plan/[siteId] segment). Empty only while the workspace hydrates.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "plan_site",
  },
  {
    name: "site_domain",
    label: "Site domain",
    description:
      "Domain (falling back to name) of the selected site, as shown in the header picker. Empty when no site is selected or the site list has not loaded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 310,
    group: "plan_site",
    autoContext: false,
  },
  {
    name: "site_organization_id",
    label: "Site organization ID",
    description:
      "UUID of the organization that owns the selected site — the org every plan row is stamped with. Empty when no site is selected or the site list has not loaded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 320,
    group: "plan_site",
    autoContext: false,
  },
  {
    name: "site",
    label: "Selected site",
    description:
      "Composite of the selected site: id, domain, name, organization_id, brand_id (null brand means the DB rejects plan rows for it — a loud, by-design error). Empty when no site is selected or the site list has not loaded.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 330,
    group: "plan_site",
  },
  {
    name: "site_options",
    label: "Available sites",
    description:
      "Compact list of the sites offered by the header picker (id, domain, name, has_brand), scoped to the active org with an all-visible fallback. Empty during initial load.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 340,
    group: "plan_site",
    autoContext: false,
  },

  // ── Workspace state (350-399) ─────────────────────────────────────────
  {
    name: "view",
    label: "Current view",
    description:
      "Which workspace view is active: `setup` (site-shape scaffolder: pick an archetype, set family counts, preview the exact routes, commit them), `tree` (tree editor + node panel), `table` (sortable/filterable data table of every planned page), `map` (radial pillar map), or `entities` (E-E-A-T entity manager). Always present — defaults to `tree` when the URL carries no `?view=`.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 350,
    group: "plan_workspace",
  },
  {
    name: "selected_node_id",
    label: "Selected node ID",
    description:
      "UUID of the plan node the user has open in the node panel. Empty when nothing is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 360,
    group: "plan_workspace",
  },

  // ── Plan shape (400-499) ──────────────────────────────────────────────
  {
    name: "node_total",
    label: "Plan node total",
    description:
      "Count of live (non-deleted) nodes in the selected site's plan. Zero for an empty plan; empty while the plan is loading or no site is selected.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 400,
    group: "plan_shape",
  },
  {
    name: "node_counts_by_status",
    label: "Node counts by status",
    description:
      "Object mapping each `plan_status` category slug to its node count, plus `unset` for nodes with no status. Empty while the plan or the status categories are loading, or when no site is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 410,
    group: "plan_shape",
  },
  {
    name: "plan_tree",
    label: "Plan tree (compact)",
    description:
      "The whole plan as a compact array in route order: one record per node with id, parent_id, depth, route, label, node_type, status slug, pillar/cluster labels, priority, and primary-keyword presence. Routes, depth, and pillar/cluster labels are DB-computed derived cache — read them, never recompute. Empty while loading or when no site is selected; can be large on big plans.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    sortOrder: 420,
    group: "plan_shape",
  },
  {
    name: "status_options",
    label: "Status options",
    description:
      "The `plan_status` categories available to nodes (id, slug, name). Empty while categories are loading.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 430,
    group: "plan_shape",
    autoContext: false,
  },

  // ── Selected node (500-549) ───────────────────────────────────────────
  {
    name: "selected_node",
    label: "Selected node detail",
    description:
      "Full detail of the open plan node: every editable field (label, slug, node_type, page_type_id, status_id, priority, technical_depth, needs_reviewer, primary_keyword_id, brief, attributes, parent_id) plus the DB-derived route, depth, pillar_label, and cluster_label (trigger-owned — never write or recompute them). Empty when no node is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 500,
    group: "plan_node",
  },
  {
    name: "selected_node_edges",
    label: "Selected node associations",
    description:
      "Association edges already loaded for the selected node — topics (`topic`), secondary keywords (`secondary_keyword`), and entity attachments (`about`/`cites`/`embeds`/`authored_by`/`reviewed_by`), each as {role, other_type, other_id, direction}. Empty when no node is selected or its associations panel has not loaded yet.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 510,
    group: "plan_node",
  },

  // ── Entities and profiles (600-649) ───────────────────────────────────
  {
    name: "entity_total",
    label: "Plan entity total",
    description:
      "Count of live E-E-A-T entities (people/sources/media/orgs) registered for the selected site. Zero when none exist; empty while loading or when no site is selected.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 600,
    group: "plan_people",
  },
  {
    name: "entities_summary",
    label: "Entities (compact)",
    description:
      "Compact list of the site's plan entities: id, label, entity_type (person | source | media | org). Empty while loading, when no site is selected, or when the site has no entities yet.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    sortOrder: 610,
    group: "plan_people",
    autoContext: false,
  },
  {
    name: "profile_verticals",
    label: "Vertical profiles",
    description:
      "The org's `plan.profile` vertical configs already loaded (id, vertical). Empty while loading, before a site (and therefore an org) is known, or when the org has no profiles.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 620,
    group: "plan_people",
    autoContext: false,
  },
];

/**
 * Workspace-level writes — UI focus only. Field-level writes live on the
 * child surfaces (`content-plan-node`, `content-plan-setup`), which shadow
 * this surface while their panel/view is active (deepest wins).
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "select_node",
    label: "Select node",
    description:
      "Opens the given plan node (UUID from plan_tree) in the node panel — same as the user clicking it. UI state only; nothing is written to the plan.",
    valueType: "string",
    updatesValue: "selected_node_id",
    mode: "ui",
    group: "plan_workspace",
    sortOrder: 100,
  },
];

export const contentPlanManifest: SurfaceManifest = {
  surfaceName: "matrx-user/content-plan",
  label: "Content Plan",
  readiness: "partial",
  readinessNote:
    "Runtime emitter live (workbench getScope over loaded query data); child surfaces (list/setup/entities/node) refine per view; no default agents bound yet; write targets code-only (not mirrored to DB).",
  urlPattern: "/marketing/content-plan/[siteId]",
  intro: `<surface_intro>
You are on the Content Plan workspace: the editable tree of every URL a managed website SHOULD have (pillars → clusters → articles), with per-node briefs, a primary keyword, topics, and the people/sources behind the content (E-E-A-T). The user sees, decides, and corrects here — agents do the bulk writing; plan rows land directly in the database and appear on refetch.
Read site (or site_id) first to know which website is being planned, then plan_tree for the whole structure and node_counts_by_status for progress. selected_node is the node the user is focused on; selected_node_edges carries its topics, secondary keywords, and entity attachments when loaded.
Hard rules: route, depth, pillar_label, and cluster_label are computed by database triggers — treat them as observed evidence, never invent or recompute them, and never propose writing them. The primary keyword is the node's primary_keyword_id column; secondary keywords are association edges. A site with a null brand cannot hold plan rows — the database rejects loudly by design; the fix is assigning a brand in Marketing, not working around the error.
This surface is the plan-editor base (tree, table, and map are three projections of the same plan). The workspace's other views are their own surfaces with their own agents: Site Setup (content-plan-setup), the entity manager (content-plan-entities), the sites front door (content-plan-list), and the open node panel (content-plan-node — where field-level write targets live). The one write target here is select_node: opening a node in the panel, exactly as a user click would.
Empty values mean the workspace is still loading, no site is selected, or the data genuinely does not exist yet — say so plainly instead of guessing.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
  agentRoles: [
    {
      name: "plan_architect",
      label: "Plan architect",
      description:
        "Designs and extends the site's URL tree — proposing pillars, clusters, and articles that fit the existing structure and keyword strategy.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "eeat_curator",
      label: "E-E-A-T curator",
      description:
        "Reviews author/reviewer/source coverage across the plan, flagging nodes that need a reviewer or better sourcing and matching them to registered entities.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 120,
    },
  ],
};

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value (only `view`: the
 * site rides `?site=` and can be absent, so nothing site-derived is
 * guaranteed). Raw-data derivation lives in
 * `features/marketing/content-plan/lib/content-plan-scope.ts`.
 */
export function createContentPlanScope(values: {
  // alwaysAvailable: true → required
  view: "tree" | "table" | "map" | "entities" | "setup";
  // alwaysAvailable: false → optional
  site_id?: string;
  site_domain?: string;
  site_organization_id?: string;
  site?: Record<string, unknown>;
  site_options?: Array<Record<string, unknown>>;
  selected_node_id?: string;
  node_total?: number;
  node_counts_by_status?: Record<string, number>;
  plan_tree?: Array<Record<string, unknown>>;
  status_options?: Array<Record<string, unknown>>;
  selected_node?: Record<string, unknown>;
  selected_node_edges?: Array<Record<string, unknown>>;
  entity_total?: number;
  entities_summary?: Array<Record<string, unknown>>;
  profile_verticals?: Array<Record<string, unknown>>;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
