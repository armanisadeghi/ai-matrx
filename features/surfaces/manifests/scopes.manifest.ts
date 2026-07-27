/**
 * Surface manifest — Scopes (`matrx-user/scopes`).
 *
 * Drives the scope hub level: `/scopes` (ScopesHub — one table per scope type,
 * rows = scopes, columns = that type's context items, cells = current values),
 * `/scopes/templates` (the read-only template catalog) and `/scopes/settings`
 * (tree diagnostics + per-org jump-off). `/scopes/manage` is a redirect to
 * `/scopes` and emits nothing.
 *
 * VOCABULARY — Scope is NOT Context (see `features/scopes/FEATURE.md`):
 *   - A SCOPE TYPE is a user-authored dimension inside an organization
 *     (Client, Department, Repo, Case). A SCOPE is one value on that dimension
 *     (Dr. Nazarian, SEO). A CONTEXT ITEM is a field defined on a scope type
 *     (the column); a CONTEXT ITEM VALUE is one scope's cell for that field.
 *   - "Context" — the full bundle the LLM receives at invocation — is
 *     assembled by the system from scopes + org + project + task + user +
 *     ambient. This surface does NOT emit that bundle; it emits the authoring
 *     material scopes are made of. Nothing here is named as if it were the
 *     resolved context bundle.
 *
 * ACTIVE CONTEXT IS READ-ONLY HERE. The `active_context` group mirrors
 * `appContextSlice` so an agent knows which scopes the user is currently
 * working under. Global active context is written ONLY by Surface A pickers
 * (`features/scopes/components/active-context/`); every value in that group is
 * a reflection, never a control.
 *
 * Runtime emitters (all via `createScopesScope`):
 *   - `features/scopes/components/management/ScopesHub.tsx`            (view "hub")
 *   - `features/scopes/components/management/TemplatesGalleryPanel.tsx` (view "templates")
 *   - `features/scopes/components/management/ScopesSettingsPanel.tsx`   (view "settings")
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

/** Canonical `ui_surface.name` for this surface. */
export const SCOPES_SURFACE_NAME = "matrx-user/scopes";

/** Which hub route is rendering. */
export type ScopesSurfaceView = "hub" | "templates" | "settings";

const groups: SurfaceValueGroup[] = [
  {
    key: "scope_directory",
    label: "Scope directory",
    sortOrder: 100,
    description:
      "The user's organizations, the scope types (dimensions) defined in each, and the scopes (values) on those dimensions.",
  },
  {
    key: "context_catalog",
    label: "Context item catalog",
    sortOrder: 200,
    description:
      "The fields defined on each scope type (the table columns) and each scope's current cell values — the material a scope contributes to an agent's context.",
  },
  {
    key: "active_context",
    label: "Active context (read-only)",
    sortOrder: 300,
    description:
      "A read-only reflection of the user's global working context (appContextSlice). Shown so an agent knows what the user is currently scoped to; this surface never writes it.",
  },
  {
    key: "templates",
    label: "Templates",
    sortOrder: 400,
    description:
      "The read-only quick-start catalog: bundles of scope types + context items for a known industry. Emitted on /scopes/templates.",
  },
  {
    key: "navigation",
    label: "Navigation & load state",
    sortOrder: 500,
    description:
      "Which hub route is open, the live filter, and the load state of the scope tree and the context-item tables.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Scope directory ───────────────────────────────────────────────────
  {
    name: "organization_count",
    label: "Organization count",
    description:
      "How many organizations the user belongs to that can own scope types. Absent until the scope tree has loaded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 300,
    group: "scope_directory",
  },
  {
    name: "organizations_summary",
    label: "Your organizations",
    description:
      "One entry per organization in the loaded scope tree: { id, name, slug, abbreviation, is_personal, role, scope_type_count, scope_count }. Absent until the tree has loaded; an org with no scope types still appears (with zeroes).",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 700,
    sortOrder: 310,
    group: "scope_directory",
  },
  {
    name: "scope_type_count",
    label: "Scope type count",
    description:
      "Total number of scope types (user-authored dimensions such as Client or Department) across every organization in the loaded tree. Absent until the tree has loaded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 320,
    group: "scope_directory",
  },
  {
    name: "scope_count",
    label: "Scope count",
    description:
      "Total number of scopes (values on those dimensions) across every scope type in the loaded tree. Absent until the tree has loaded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 330,
    group: "scope_directory",
  },
  {
    name: "scope_types_summary",
    label: "Scope types",
    description:
      "One entry per scope type: { id, organization_id, organization_name, label_singular, label_plural, icon, color, sort_order, parent_type_id, scope_count }. The user's dimension model at a glance. Absent until the tree has loaded.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1400,
    sortOrder: 340,
    group: "scope_directory",
  },
  {
    name: "scopes_summary",
    label: "Scopes",
    description:
      "One entry per scope across every type: { id, scope_type_id, scope_type_label, organization_id, name, description, parent_scope_id }. Absent until the tree has loaded; can be long on orgs with many scopes.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    autoContext: false,
    sortOrder: 350,
    group: "scope_directory",
  },
  {
    name: "empty_organization_ids",
    label: "Organizations without scopes",
    description:
      "Ids of organizations in the tree that have no scope types defined yet — the ones the hub offers a 'Define scopes' link for. Absent until the tree has loaded; empty array when every org has scopes.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 80,
    autoContext: false,
    sortOrder: 360,
    group: "scope_directory",
  },

  // ── Context item catalog ──────────────────────────────────────────────
  {
    name: "context_item_count",
    label: "Context item count",
    description:
      "How many active context items (fields defined on scope types) were loaded for the scope types on screen. Emitted on the hub view once the column/cell fetch is ready; absent on the templates and settings views.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 300,
    group: "context_catalog",
  },
  {
    name: "context_items_summary",
    label: "Context items",
    description:
      "One entry per loaded context item: { id, scope_type_id, key, display_name, description, value_type, sort_order }. These are the FIELDS a scope type defines (the table columns), not their values. Emitted on the hub view once the fetch is ready.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    autoContext: false,
    sortOrder: 310,
    group: "context_catalog",
  },
  {
    name: "scope_context_values",
    label: "Scope context values",
    description:
      "The table cells: an object keyed by scope id, each mapping context-item key to that scope's current value summarized as text. This is the authored per-scope data itself — large, so it is bindable-only. Emitted on the hub view once the fetch is ready.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    autoContext: false,
    sortOrder: 320,
    group: "context_catalog",
  },
  {
    name: "context_catalog_status",
    label: "Catalog load state",
    description:
      'Load state of the context-item column/cell fetch: "idle", "loading", "ready" or "error". Emitted on the hub view only; a value of "error" means the tables on screen are incomplete, not empty.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 7,
    sortOrder: 330,
    group: "context_catalog",
  },

  // ── Active context (read-only reflection) ─────────────────────────────
  {
    name: "active_organization_id",
    label: "Active organization ID",
    description:
      "READ-ONLY reflection of the organization currently selected in the user's global working context (appContextSlice). Absent when none is selected. This surface never writes it — only Surface A pickers do.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "active_context",
  },
  {
    name: "active_organization_name",
    label: "Active organization name",
    description:
      "READ-ONLY reflection of the name of the globally-selected organization. Absent when none is selected or the name has not resolved.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 310,
    group: "active_context",
  },
  {
    name: "active_scope_ids",
    label: "Active scope IDs",
    description:
      "READ-ONLY reflection of the scope ids currently active in the global working context (multi-scope: any number, at most one per scope type). Absent until the active-context slice is read; empty array when the user has no scope selected.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 320,
    group: "active_context",
  },
  {
    name: "active_scopes_summary",
    label: "Active scopes",
    description:
      "READ-ONLY reflection of the globally-active scopes resolved through the loaded tree: { id, name, scope_type_id, scope_type_label, organization_id }. Selections whose scope is not in the tree are omitted. Empty array when nothing is active.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 330,
    group: "active_context",
  },
  {
    name: "active_project_id",
    label: "Active project ID",
    description:
      "READ-ONLY reflection of the project selected in the global working context. Absent when no project is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    sortOrder: 340,
    group: "active_context",
  },
  {
    name: "active_task_id",
    label: "Active task ID",
    description:
      "READ-ONLY reflection of the task selected in the global working context. Absent when no task is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    sortOrder: 350,
    group: "active_context",
  },
  {
    name: "active_context_selection",
    label: "Active selection summary",
    description:
      "READ-ONLY composite of the user's global working selection as one object: { organization_id, organization_name, scope_ids, project_id, task_id }. Mirrors the individual active_context values (completeness law). It is the user's CURRENT SELECTION, not the resolved context bundle an agent receives at invocation.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 360,
    group: "active_context",
  },

  // ── Templates ─────────────────────────────────────────────────────────
  {
    name: "template_count",
    label: "Template count",
    description:
      "How many scope templates are in the read-only quick-start catalog. Emitted on /scopes/templates only; absent on the hub and settings views.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 300,
    group: "templates",
  },
  {
    name: "templates_summary",
    label: "Templates",
    description:
      "One entry per catalog template: { id, key, name, description, category, scope_type_count, context_item_count }. A template is a starter bundle of scope types + context items, never part of any active context. Emitted on /scopes/templates only.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 310,
    group: "templates",
  },
  {
    name: "template_categories",
    label: "Template categories",
    description:
      "Distinct category names the templates gallery groups by (e.g. marketing, legal, general). Emitted on /scopes/templates only; empty array when the catalog is empty.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 320,
    group: "templates",
  },
  {
    name: "template_target_organization_id",
    label: "Template target organization",
    description:
      "Id of the organization the gallery's 'Apply to…' links point at (the globally-active org, else the first org). Emitted on /scopes/templates; absent when the user has no organizations.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    sortOrder: 330,
    group: "templates",
  },

  // ── Navigation & load state ───────────────────────────────────────────
  {
    name: "current_view",
    label: "Current view",
    description:
      '"hub" on /scopes, "templates" on /scopes/templates, "settings" on /scopes/settings. Always present — every emitter knows which route it is.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 9,
    sortOrder: 300,
    group: "navigation",
  },
  {
    name: "search_query",
    label: "Filter query",
    description:
      "The hub's live scope filter text. Present only on the hub view while the user has typed a filter; absent otherwise. Note the summaries above are always the FULL set, not the filtered one.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    autoContext: false,
    sortOrder: 310,
    group: "navigation",
  },
  {
    name: "tree_status",
    label: "Scope tree load state",
    description:
      'Load state of the canonical scope tree: "idle", "loading", "ready" or "error". Emitted on every view. "error" means the directory values are missing because the fetch failed, not because the user has no scopes.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 7,
    sortOrder: 320,
    group: "navigation",
  },
  {
    name: "tree_fetched_at",
    label: "Tree fetched at",
    description:
      "ISO timestamp of the last successful scope-tree fetch (the tree is fetched once at boot and cached for the session). Absent before the first successful fetch.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    autoContext: false,
    sortOrder: 330,
    group: "navigation",
  },
  {
    name: "tree_error",
    label: "Scope tree error",
    description:
      "Error message from the last failed scope-tree fetch. Absent when the tree loaded cleanly.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 340,
    group: "navigation",
  },
];

export const scopesManifest: SurfaceManifest = {
  surfaceName: SCOPES_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Manifest + emitters wired on /scopes, /scopes/templates and /scopes/settings; not yet live-verified with a bound agent, and the embedded knowledge-graph suggestions inbox (HeavyHitterSuggestionsInbox on the hub) loads data that is not declared here.",
  label: "Scopes",
  urlPattern: "/scopes",
  intro: `<surface_intro>
You are on the Scopes surface: where the user authors the DIMENSIONS their work is organized by, inside their organizations.
Vocabulary, and keep it straight: a SCOPE TYPE is a dimension (Client, Department, Repo, Case). A SCOPE is one value on that dimension (Dr. Nazarian, SEO). A CONTEXT ITEM is a field defined on a scope type — the column. A CONTEXT ITEM VALUE is one scope's cell for that field. The hub renders exactly that: one table per scope type, rows are scopes, columns are context items, cells are values.
Scopes are the highest-signal part of an agent's context because they are the only part the user authors by hand. Changing which scope is active changes what a good answer even looks like, without changing the question.
Do NOT read this surface's values as the context bundle an agent receives at invocation. That bundle is assembled by the system from scopes plus organization, project, task, user and ambient signals. What you get here is the authoring material.
The Active context group is a READ-ONLY reflection of the user's current global working selection so you know what they are scoped to right now. This surface never changes it — only the dedicated active-context picker does. If the user asks to switch what they are working on, tell them to use that picker; do not treat these values as controls.
Read current_view first: "hub" (the scope tables), "templates" (the read-only quick-start catalog of scope types + context items — starter bundles, never active context), or "settings" (scope-tree diagnostics and per-org jump-off).
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/** One organization entry as emitted in `organizations_summary`. */
export interface ScopesOrganizationEntry {
  id: string;
  name: string;
  slug: string;
  abbreviation: string;
  is_personal: boolean;
  role: string;
  scope_type_count: number;
  scope_count: number;
}

/** One scope-type entry as emitted in `scope_types_summary`. */
export interface ScopesScopeTypeEntry {
  id: string;
  organization_id: string;
  organization_name: string;
  label_singular: string;
  label_plural: string;
  icon: string;
  color: string;
  sort_order: number;
  parent_type_id: string | null;
  scope_count: number;
}

/** One scope entry as emitted in `scopes_summary`. */
export interface ScopesScopeEntry {
  id: string;
  scope_type_id: string;
  scope_type_label: string;
  organization_id: string;
  name: string;
  description: string;
  parent_scope_id: string | null;
}

/** One context-item entry as emitted in `context_items_summary`. */
export interface ScopesContextItemEntry {
  id: string;
  scope_type_id: string;
  key: string;
  display_name: string;
  description: string;
  value_type: string;
  sort_order: number;
}

/** One active-scope entry as emitted in `active_scopes_summary`. */
export interface ScopesActiveScopeEntry {
  id: string;
  name: string;
  scope_type_id: string;
  scope_type_label: string;
  organization_id: string;
}

/** One template entry as emitted in `templates_summary`. */
export interface ScopesTemplateEntry {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  scope_type_count: number;
  context_item_count: number;
}

/**
 * Every value this surface can emit, as a typed bag. Split out from
 * `createScopesScope` so the child surface (`matrx-user/context-items`) can
 * accept the inherited keys without restating them.
 */
export interface ScopesScopeValues {
  // alwaysAvailable: true → required
  current_view: ScopesSurfaceView | string;
  // alwaysAvailable: false → optional
  organization_count?: number;
  organizations_summary?: ScopesOrganizationEntry[];
  scope_type_count?: number;
  scope_count?: number;
  scope_types_summary?: ScopesScopeTypeEntry[];
  scopes_summary?: ScopesScopeEntry[];
  empty_organization_ids?: string[];
  context_item_count?: number;
  context_items_summary?: ScopesContextItemEntry[];
  scope_context_values?: Record<string, Record<string, string>>;
  context_catalog_status?: string;
  active_organization_id?: string;
  active_organization_name?: string;
  active_scope_ids?: string[];
  active_scopes_summary?: ScopesActiveScopeEntry[];
  active_project_id?: string;
  active_task_id?: string;
  active_context_selection?: {
    organization_id: string | null;
    organization_name: string | null;
    scope_ids: string[];
    project_id: string | null;
    task_id: string | null;
  };
  template_count?: number;
  templates_summary?: ScopesTemplateEntry[];
  template_categories?: string[];
  template_target_organization_id?: string;
  search_query?: string;
  tree_status?: string;
  tree_fetched_at?: string;
  tree_error?: string;
  selection?: string;
  context?: Record<string, unknown>;
}

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement. `current_view`
 * is the only required key because it is the only value every emitter can
 * guarantee: the three hub routes each load a different slice of the data, and
 * all of it resolves asynchronously after the boot tree fetch.
 */
export function createScopesScope(
  values: ScopesScopeValues,
): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
