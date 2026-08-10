/**
 * Surface manifest — Agent Apps admin (`matrx-admin/agent-apps`).
 *
 * ADMIN SURFACE. Drives the whole `/administration/agents/agent-apps/**`
 * subtree — one hub surface covering the dashboard, the apps list, the
 * per-app edit shell, categories, executions/errors, analytics, and rate
 * limits. Each sub-route is its own client component with its own local
 * state; `admin_section` tells you which one is currently rendering.
 *
 * Sub-routes and their backing components:
 *   - dashboard    → app/(admin).../agent-apps/page.tsx (AgentAppsAdminDashboardPage)
 *   - apps         → .../agent-apps/apps/page.tsx (AgentAppsAdminListPage)
 *   - edit/[id]    → .../agent-apps/edit/[id]/page.tsx (AdminEditAgentAppPage)
 *   - categories   → .../agent-apps/categories/page.tsx
 *   - executions   → .../agent-apps/executions/page.tsx (tabs: executions/errors)
 *   - analytics    → .../agent-apps/analytics/page.tsx
 *   - rate-limits  → .../agent-apps/rate-limits/RateLimitsClient.tsx
 *
 * What an agent bound here may safely do: read whichever section's data is
 * loaded (counts, filters, the selected app or category or error, table
 * rows) and help the admin moderate — draft a rejection/resolution note,
 * explain an error, summarize analytics, or spot a suspicious rate-limit
 * pattern. It must NOT assume a feature/verify/publish/delete/unblock
 * action has happened; those are the admin's own button clicks and API
 * calls (`updateAgentAppAdmin`, `unblockAgentAppRateLimit`, etc.).
 *
 * Emitters: WIRED on every section — dashboard (AgentAppsAdminDashboardPage),
 * apps list (AgentAppsAdminListPage), edit/[id] (AdminEditAgentAppPage,
 * controlled admin/code tab), categories (AgentAppsCategoriesAdminPage),
 * executions/errors (ExecutionsTable + ErrorsTable, one provider per mounted
 * tab), analytics (AgentAppsAnalyticsPage), and rate-limits
 * (RateLimitsClient). Each section computes its own self-contained scope from
 * its live local state at Run time.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_AGENT_APPS_SURFACE_NAME = "matrx-admin/agent-apps";

const groups: SurfaceValueGroup[] = [
  {
    key: "navigation",
    label: "Navigation",
    sortOrder: 100,
    description: "Which sub-route of the agent-apps admin is rendering.",
  },
  {
    key: "dashboard",
    label: "Dashboard",
    sortOrder: 150,
    description:
      "Aggregate stat-tile counts and the featured / recently-updated app previews on the dashboard.",
  },
  {
    key: "apps_list",
    label: "Apps list",
    sortOrder: 200,
    description:
      "The full apps table's filters, sort, and loaded rows on the Apps tab.",
  },
  {
    key: "app_detail",
    label: "App detail",
    sortOrder: 300,
    description:
      "The single agent app open in the edit/[id] admin shell — its identity, analytics, active tab, and timestamps.",
  },
  {
    key: "categories",
    label: "Categories",
    sortOrder: 400,
    description: "The category list and the category open for editing.",
  },
  {
    key: "executions",
    label: "Executions & errors",
    sortOrder: 500,
    description:
      "The Executions and Errors tabs: their filters, stats, rows, and the error open in the detail dialog.",
  },
  {
    key: "analytics",
    label: "Analytics",
    sortOrder: 550,
    description: "Platform-wide execution/cost totals and per-app rows.",
  },
  {
    key: "rate_limits",
    label: "Rate limits",
    sortOrder: 600,
    description: "The rate-limit table's filters, stats, and rows.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Navigation ───────────────────────────────────────────────────────
  {
    name: "admin_section",
    label: "Admin section",
    description:
      'Which sub-route is rendering: "dashboard", "apps", "edit", "categories", "executions", "analytics", or "rate_limits". Always present — each emitter declares its own value.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 100,
    group: "navigation",
  },

  // ── Dashboard ────────────────────────────────────────────────────────
  {
    name: "dashboard_total_apps",
    label: "Dashboard: total apps",
    description:
      "Total agent-app count shown on the dashboard stat tiles. Absent outside the dashboard section.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 150,
    group: "dashboard",
  },
  {
    name: "dashboard_published_count",
    label: "Dashboard: published count",
    description:
      "Number of apps with status=published. Absent outside the dashboard section.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 160,
    group: "dashboard",
  },
  {
    name: "dashboard_featured_count",
    label: "Dashboard: featured count",
    description:
      "Number of apps with is_featured=true. Absent outside the dashboard section.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 170,
    group: "dashboard",
  },
  {
    name: "dashboard_verified_count",
    label: "Dashboard: verified count",
    description:
      "Number of apps with is_verified=true. Absent outside the dashboard section.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 180,
    group: "dashboard",
  },
  {
    name: "dashboard_featured_apps",
    label: "Dashboard: featured apps",
    description:
      "Up to 6 published+featured apps shown in the 'Featured apps' preview row (id, name, slug, status). Bindable rather than auto-context. Absent outside the dashboard section; empty array when none are featured.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    autoContext: false,
    sortOrder: 190,
    group: "dashboard",
  },
  {
    name: "dashboard_recent_apps",
    label: "Dashboard: recently updated apps",
    description:
      "Up to 6 apps sorted by updated_at desc, shown in the 'Recently updated' preview row. Bindable rather than auto-context. Absent outside the dashboard section.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    autoContext: false,
    sortOrder: 195,
    group: "dashboard",
  },

  // ── Apps list ────────────────────────────────────────────────────────
  {
    name: "apps_list_total_count",
    label: "Apps list: total count",
    description:
      "Total apps loaded (before column filters are applied). Absent outside the apps-list section.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 200,
    group: "apps_list",
  },
  {
    name: "apps_list_filtered_count",
    label: "Apps list: filtered count",
    description:
      "Number of rows visible after the current column filters are applied. Absent outside the apps-list section.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 205,
    group: "apps_list",
  },
  {
    name: "apps_list_filters",
    label: "Apps list: active filters",
    description:
      "The column filter state: name/slug/creator text filters, status/category multi-select, featured/verified tri-state. Absent outside the apps-list section.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 210,
    group: "apps_list",
  },
  {
    name: "apps_list_sort",
    label: "Apps list: sort",
    description:
      "Which column the table is sorted by and the direction (asc/desc). Absent outside the apps-list section.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 220,
    group: "apps_list",
  },
  {
    name: "apps_list_rows",
    label: "Apps list: rows",
    description:
      "The filtered+sorted apps table rows: id, name, slug, status, category, creator_email, is_featured, is_verified, total_executions, unique_users_count, success_rate, total_cost, updated_at. Bindable rather than auto-context — this can be hundreds of rows. Absent outside the apps-list section.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 230,
    group: "apps_list",
  },

  // ── App detail (edit/[id]) ───────────────────────────────────────────
  {
    name: "selected_app_id",
    label: "Selected app id",
    description:
      "UUID of the agent app open in the admin edit shell (edit/[id]). Absent outside the edit section.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "app_detail",
  },
  {
    name: "selected_app_summary",
    label: "Selected app summary",
    description:
      "Identity of the app being edited: name, slug, category, creator_email, tagline, description, status. Absent outside the edit section.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 310,
    group: "app_detail",
  },
  {
    name: "selected_app_analytics",
    label: "Selected app analytics",
    description:
      "Aggregate counters for the app being edited: total_executions, unique_users_count, success_rate, total_cost. Absent outside the edit section.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 320,
    group: "app_detail",
  },
  {
    name: "selected_app_tab",
    label: "Selected app: active tab",
    description:
      '"admin" (moderation + metadata) or "code" (component-code editor) — which tab of the edit shell is open. Absent outside the edit section.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 330,
    group: "app_detail",
  },
  {
    name: "selected_app_timestamps",
    label: "Selected app timestamps",
    description:
      "created_at, updated_at, published_at, last_execution_at for the app being edited. published_at/last_execution_at may be null. Absent outside the edit section.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 340,
    group: "app_detail",
  },

  // ── Categories ───────────────────────────────────────────────────────
  {
    name: "categories_list",
    label: "Categories list",
    description:
      "Every agent-app category row: id, name, description, icon, sort_order. Bindable rather than auto-context. Absent outside the categories section.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    sortOrder: 400,
    group: "categories",
  },
  {
    name: "categories_count",
    label: "Categories count",
    description:
      "Number of categories loaded. Absent outside the categories section.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 405,
    group: "categories",
  },
  {
    name: "categories_search",
    label: "Categories search text",
    description:
      "Text currently typed in the category search box. Absent outside the categories section; empty string when untouched.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 410,
    group: "categories",
  },
  {
    name: "selected_category",
    label: "Selected category",
    description:
      "The category open in the right-hand edit panel: id, name, description, icon, sort_order. These are the LIVE edit-form values, so they include changes the admin (or an agent write) has staged but not yet saved — category_has_unsaved_changes tells you whether they still match the saved row in categories_list. Absent when no category is selected or outside the categories section.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 420,
    group: "categories",
  },
  {
    name: "category_has_unsaved_changes",
    label: "Category has unsaved changes",
    description:
      "True when the selected category's edit form has been changed but not yet saved. Absent when no category is selected.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 430,
    group: "categories",
  },

  // ── Executions & errors ──────────────────────────────────────────────
  {
    name: "executions_active_tab",
    label: "Executions: active tab",
    description:
      '"executions" or "errors" — which tab of the Executions & Errors page is open. Absent outside the executions section.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 500,
    group: "executions",
  },
  {
    name: "executions_rows",
    label: "Execution rows",
    description:
      "Execution log rows currently VISIBLE in the grid (after the app/outcome filters): success, app_name/slug, task_id, user/fingerprint/ip identifier, tokens_used, cost, execution_time_ms, created_at. Bindable rather than auto-context; up to 500 rows. Note executions_stats counts ALL loaded rows, not just these. Absent outside the Executions tab.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 5000,
    autoContext: false,
    sortOrder: 510,
    group: "executions",
  },
  {
    name: "executions_stats",
    label: "Execution stats",
    description:
      "total/success/failed counts over ALL loaded execution rows (the stat tiles) — NOT the filtered subset in executions_rows. Absent outside the Executions tab.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 520,
    group: "executions",
  },
  {
    name: "executions_app_filter",
    label: "Executions app filter",
    description:
      "Text filter applied to the execution rows by app name/slug/id. Absent outside the Executions tab; empty when untouched.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 530,
    group: "executions",
  },
  {
    name: "executions_success_filter",
    label: "Executions success filter",
    description:
      '"all", "success", or "failed" — the outcome filter applied to the loaded execution rows. Absent outside the Executions tab.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 7,
    sortOrder: 535,
    group: "executions",
  },
  {
    name: "errors_rows",
    label: "Error rows",
    description:
      "App-execution error rows currently VISIBLE in the grid (after the type/app filters): resolved, error_type, app_name/slug, error_message, created_at. Bindable rather than auto-context; up to 500 rows. Note errors_stats counts ALL loaded rows, not just these. Absent outside the Errors tab.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 540,
    group: "executions",
  },
  {
    name: "errors_stats",
    label: "Error stats",
    description:
      "total/resolved/unresolved counts over ALL loaded error rows (the stat tiles) — NOT the filtered subset in errors_rows. Absent outside the Errors tab.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 550,
    group: "executions",
  },
  {
    name: "errors_resolved_filter",
    label: "Errors resolved filter",
    description:
      '"all", "resolved", or "unresolved" — the resolution filter applied to the loaded error rows. Absent outside the Errors tab.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 560,
    group: "executions",
  },
  {
    name: "selected_error",
    label: "Selected error",
    description:
      "The error open in the detail dialog: error_type, error_message, error_code, app_name/slug, variables_sent, expected_variables, error_details, resolved, created_at. Absent when no error is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    sortOrder: 570,
    group: "executions",
  },

  // ── Analytics ────────────────────────────────────────────────────────
  {
    name: "analytics_totals",
    label: "Analytics: platform totals",
    description:
      "Sum across every loaded app: totalExecutions, totalUniqueUsers, totalCost, totalTokens. Absent outside the analytics section.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 100,
    group: "analytics",
  },
  {
    name: "analytics_overall_success_rate",
    label: "Analytics: overall success rate",
    description:
      "Execution-weighted success rate across all apps, as a percentage (0-100). Absent outside the analytics section.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 110,
    group: "analytics",
  },
  {
    name: "analytics_per_app_rows",
    label: "Analytics: per-app rows",
    description:
      "Per-app aggregates shown in the performance list: name, slug, status, is_featured, is_verified, total_executions, unique_users_count, success_rate, avg_execution_time_ms, total_cost, last_execution_at. Bindable rather than auto-context. Absent outside the analytics section.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 120,
    group: "analytics",
  },

  // ── Rate limits ──────────────────────────────────────────────────────
  {
    name: "rate_limits_rows",
    label: "Rate limit rows",
    description:
      "Rate-limit rows currently VISIBLE in the grid (after the app/identifier/type/blocked column filters, sorted): app_name/slug, identifier (user_id/ip_address/fingerprint), is_blocked, execution_count, first/last_execution_at, blocked_until, blocked_reason. Bindable rather than auto-context; up to 500 rows. Note rate_limits_stats counts the FULL fetch, not just these. Absent outside the rate-limits section.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 5000,
    autoContext: false,
    sortOrder: 600,
    group: "rate_limits",
  },
  {
    name: "rate_limits_stats",
    label: "Rate limit stats",
    description:
      "total/blocked/active/users/ips counts over the FULL rate-limit fetch (the stat tiles) — NOT the filtered subset in rate_limits_rows. Absent outside the rate-limits section.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 610,
    group: "rate_limits",
  },
  {
    name: "rate_limits_filters",
    label: "Rate limit filters",
    description:
      "The active column filters: appName/identifier text filters, identifierType (user/ip/fingerprint), blocked tri-state (defaults to 'blocked'). Absent outside the rate-limits section.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 620,
    group: "rate_limits",
  },
];

/**
 * Write targets — the CATEGORIES editor only.
 *
 * This is a moderation console, and almost none of it earns a write path: the
 * apps table's is_featured / is_verified / status are abuse and trust controls,
 * rate limits and unblocks are enforcement, and executions/errors/analytics are
 * read-only evidence. The one place an admin authors COPY is the category edit
 * pane, whose name / description / icon are exactly the "an agent drafts this
 * better and faster" case.
 *
 * All three are `mode: "draft"`: they set the same `editData` buffer the
 * admin's own typing sets, the "Unsaved Changes" badge lights up, and the
 * admin's own Save press is what calls `updateAgentAppCategory`. That is why
 * `updatesValue` points at `selected_category` — that value is emitted FROM the
 * same buffer, so an agent can read back what it staged before the save.
 *
 * Name, description and icon are three separate targets rather than one field
 * object because they are independent decisions with different stakes: renaming
 * a category re-labels it everywhere it is offered to users, while rewriting
 * its description or swapping its icon does not. Separate targets mean the
 * admin gets a separate confirm for each and can approve one and decline
 * another.
 *
 * Deliberately NOT writable: the category `id` (identity — immutable after
 * creation, and the disabled input says so), `sort_order` (mechanical ordering
 * the admin does with the list's own up/down arrows, one row at a time),
 * category creation and deletion (deletion orphans every app assigned to the
 * category), and every other section of this console.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "category_name",
    label: "Category name",
    description:
      "Stages a new display name into the Name field of the category open in the categories editor. Value: a non-empty plain string, which REPLACES the current name. Requires a category to be selected — with an empty edit pane this is refused. This is a draft: it lands in the input, the 'Unsaved Changes' badge appears, and the admin still presses Save before anything reaches the database. selected_category.name reflects the staged value immediately; categories_list keeps the saved name until they save.",
    valueType: "string",
    updatesValue: "selected_category",
    mode: "draft",
    applyPolicy: "ask",
    group: "categories",
    sortOrder: 440,
  },
  {
    name: "category_description",
    label: "Category description",
    description:
      "Stages the description of the category open in the categories editor — the sentence explaining what kind of agent app belongs in it. Value: a plain string (pass an empty string to clear it), which REPLACES the full description rather than appending — read selected_category.description first and include any existing text you want kept. Requires a category to be selected. This is a draft: the admin still presses Save. selected_category.description reflects the staged value immediately.",
    valueType: "string",
    updatesValue: "selected_category",
    mode: "draft",
    applyPolicy: "ask",
    group: "categories",
    sortOrder: 445,
  },
  {
    name: "category_icon",
    label: "Category icon",
    description:
      "Stages the icon of the category open in the categories editor. Value: the exact PascalCase name of a lucide-react icon, e.g. \"PenTool\", \"Lightbulb\", \"Zap\" — it is validated against the real icon registry and an unknown name is rejected rather than saved as a broken icon. Pass an empty string to clear it back to the default tag icon. Requires a category to be selected. This is a draft: the preview swatch beside the input updates at once and the admin still presses Save.",
    valueType: "string",
    updatesValue: "selected_category",
    mode: "draft",
    applyPolicy: "ask",
    group: "categories",
    sortOrder: 450,
  },
];

export const adminAgentAppsManifest: SurfaceManifest = {
  surfaceName: ADMIN_AGENT_APPS_SURFACE_NAME,
  readiness: "verified",
  label: "Agent Apps Admin",
  urlPattern: "/administration/agents/agent-apps",
  intro: `<surface_intro>
This is an ADMIN surface covering the whole Agent Apps admin subtree at /administration/agents/agent-apps/**. It moderates every public agent-backed app on the platform (app.definition rows) — feature/verify/publish status, categories, execution history, per-app analytics, and rate limits.

admin_section tells you which sub-route is rendering: "dashboard" (overview stat tiles + featured/recent app previews), "apps" (the full filterable/sortable apps table), "edit" (one app's admin + component-code shell), "categories" (the category list/editor), "executions" (execution log + error tabs), "analytics" (platform-wide aggregates), or "rate_limits" (per-identifier execution throttling).

How to read the values: each section's group (dashboard_*, apps_list_*, selected_app_*, categories_*, executions_*/errors_*, analytics_*, rate_limits_*) is only populated when admin_section matches — everything else on this surface is absent, not stale.

What you may safely do: help the admin draft moderation notes, error resolutions, or category descriptions, summarize analytics or a suspicious rate-limit pattern, and explain what a row means. You never feature, verify, publish, delete, resolve, or unblock anything yourself — those are the admin's own actions, which call updateAgentAppAdmin / resolveAgentAppError / unblockAgentAppRateLimit.

The ONE thing you can WRITE through apply_surface_write is the category open in the categories editor: its name, description and icon. All three stage into the edit form for the admin to Save — nothing reaches the database until they press it — and all three need a category selected first. Everything else on this console is read-only to you: featuring, verifying, publishing or suspending an app, editing rate limits, resolving errors, reordering categories, and creating or deleting a category are moderation controls, so propose those in words instead of trying to write them.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

// ── Runtime row/summary shapes ────────────────────────────────────────────

export interface AdminAgentAppPreviewRow {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export interface AdminAgentAppsListRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  category: string | null | undefined;
  creator_email: string | null | undefined;
  is_featured: boolean;
  is_verified: boolean;
  total_executions: number | null;
  unique_users_count: number | null;
  success_rate: number | null;
  total_cost: number | null;
  updated_at: string;
}

export interface AdminAgentAppsListFilters {
  name: string;
  slug: string;
  status: string[];
  category: string[];
  featured: "all" | "featured" | "not-featured";
  verified: "all" | "verified" | "not-verified";
  creator: string;
}

export interface AdminAgentAppsListSort {
  field: string;
  direction: "asc" | "desc";
}

export interface AdminAgentAppSummary {
  name: string;
  slug: string;
  category: string | null;
  creator_email: string | null;
  tagline: string | null;
  description: string | null;
  status: string;
}

export interface AdminAgentAppAnalytics {
  total_executions: number | null;
  unique_users_count: number | null;
  success_rate: number | null;
  total_cost: number | null;
}

export interface AdminAgentAppTimestamps {
  created_at: string;
  updated_at: string;
  published_at: string | null;
  last_execution_at: string | null;
}

export interface AdminAgentAppCategoryRowSummary {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
}

export interface AdminAgentAppExecutionRowSummary {
  success: boolean;
  app_name: string | null;
  app_slug: string | null;
  task_id: string;
  user_id: string | null;
  fingerprint: string | null;
  ip_address: string | null;
  tokens_used: number | null;
  cost: number | null;
  execution_time_ms: number | null;
  created_at: string;
}

export interface AdminAgentAppErrorRowSummary {
  resolved: boolean;
  error_type: string;
  app_name: string | null;
  app_slug: string | null;
  error_message: string | null;
  created_at: string;
}

export interface AdminAgentAppRateLimitRowSummary {
  app_name: string;
  app_slug: string;
  user_id: string | null;
  ip_address: string | null;
  fingerprint: string | null;
  is_blocked: boolean;
  execution_count: number;
  first_execution_at: string;
  last_execution_at: string;
  blocked_until: string | null;
  blocked_reason: string | null;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value
 * declared `alwaysAvailable: true`; optional keys mirror `alwaysAvailable:
 * false`. Every section's values are optional — only `admin_section` is
 * guaranteed, since a given emitter only ever fills its own section's keys.
 */
export function createAdminAgentAppsScope(values: {
  // alwaysAvailable: true → required
  admin_section:
    | "dashboard"
    | "apps"
    | "edit"
    | "categories"
    | "executions"
    | "analytics"
    | "rate_limits";
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  // dashboard
  dashboard_total_apps?: number;
  dashboard_published_count?: number;
  dashboard_featured_count?: number;
  dashboard_verified_count?: number;
  dashboard_featured_apps?: AdminAgentAppPreviewRow[];
  dashboard_recent_apps?: AdminAgentAppPreviewRow[];
  // apps list
  apps_list_total_count?: number;
  apps_list_filtered_count?: number;
  apps_list_filters?: AdminAgentAppsListFilters;
  apps_list_sort?: AdminAgentAppsListSort;
  apps_list_rows?: AdminAgentAppsListRow[];
  // app detail
  selected_app_id?: string;
  selected_app_summary?: AdminAgentAppSummary;
  selected_app_analytics?: AdminAgentAppAnalytics;
  selected_app_tab?: "admin" | "code";
  selected_app_timestamps?: AdminAgentAppTimestamps;
  // categories
  categories_list?: AdminAgentAppCategoryRowSummary[];
  categories_count?: number;
  categories_search?: string;
  selected_category?: AdminAgentAppCategoryRowSummary;
  category_has_unsaved_changes?: boolean;
  // executions & errors
  executions_active_tab?: "executions" | "errors";
  executions_rows?: AdminAgentAppExecutionRowSummary[];
  executions_stats?: { total: number; success: number; failed: number };
  executions_app_filter?: string;
  executions_success_filter?: "all" | "success" | "failed";
  errors_rows?: AdminAgentAppErrorRowSummary[];
  errors_stats?: { total: number; resolved: number; unresolved: number };
  errors_resolved_filter?: "all" | "resolved" | "unresolved";
  selected_error?: AdminAgentAppErrorRowSummary & {
    error_code?: string | null;
    variables_sent?: unknown;
    expected_variables?: unknown;
    error_details?: unknown;
  };
  // analytics
  analytics_totals?: {
    totalExecutions: number;
    totalUniqueUsers: number;
    totalCost: number;
    totalTokens: number;
  };
  analytics_overall_success_rate?: number;
  analytics_per_app_rows?: (AdminAgentAppsListRow & {
    avg_execution_time_ms: number | null;
  })[];
  // rate limits
  rate_limits_rows?: AdminAgentAppRateLimitRowSummary[];
  rate_limits_stats?: {
    total: number;
    blocked: number;
    active: number;
    users: number;
    ips: number;
  };
  rate_limits_filters?: {
    appName: string;
    identifier: string;
    identifierType: "all" | "user" | "ip" | "fingerprint";
    blocked: "all" | "blocked" | "not-blocked";
  };
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
