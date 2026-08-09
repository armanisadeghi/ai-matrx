/**
 * Surface manifest — Applications admin (`matrx-admin/applications`).
 *
 * ADMIN SURFACE. Drives `/administration/applications/**`
 * (`app/(admin)/administration/applications/`), the hub governing OUR shipped
 * client applications (desktop, extension, mobile): remote runtime
 * configuration, remote catalogs, the installed fleet, and one unified audit
 * history. "Applications" here NEVER means user-created agent apps.
 *
 * Five route-tabbed pages share one shell (`ApplicationsAdminLayoutClient.tsx`):
 *
 *   - Overview       `page.tsx` → `ApplicationsOverview.tsx` — per-application
 *     cards summarising config / catalogs / fleet, with a loud banner when any
 *     instance is below the published minimum version.
 *   - Configuration  `configuration/page.tsx` → `AppConfigClient.tsx` — list of
 *     `app_config` rows → per-application editor (own client state: "list" /
 *     "edit" / "new").
 *   - Catalogs       `catalogs/page.tsx` → `CatalogsClient.tsx` — app selector
 *     → kind dashboard → kind table → entry editor over `catalog_entries`.
 *   - Installations   `installations/page.tsx` → `InstallationsClient.tsx` —
 *     the installed fleet via `admin_list_app_instances`, each row compared
 *     against the live `min_supported_app_version`.
 *   - History        `history/page.tsx` → `ApplicationsHistoryClient.tsx` — one
 *     merged audit timeline over `app_config_history` + `catalog_entries_history`.
 *
 * `active_tab` is derived from the pathname (route-tabbed, so reliably knowable
 * at any moment) via the layout's base provider; each tab component mounts a
 * NESTED provider (deepest wins) that adds its own live component state.
 *
 * What an agent bound here may safely do: read which tab the admin is on and
 * reason about a specific application's configuration/catalog/fleet standing.
 * It must NOT assume anything outside the active tab's group is currently
 * live in scope.
 *
 * Emitters (real, wired):
 *   - active_tab   → `ApplicationsAdminLayoutClient.tsx` (base provider)
 *   - Overview     → `overview/components/ApplicationsOverview.tsx`
 *   - Configuration→ `config/components/AppConfigClient.tsx`
 *   - Catalogs     → `catalogs/components/CatalogsClient.tsx`
 *   - Installations→ `installations/components/InstallationsClient.tsx`
 *   - History      → `history/components/ApplicationsHistoryClient.tsx`
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_APPLICATIONS_SURFACE_NAME = "matrx-admin/applications";

const groups: SurfaceValueGroup[] = [
  {
    key: "hub",
    label: "Applications hub",
    sortOrder: 100,
    description: "Which of the five tabs the admin is currently on.",
  },
  {
    key: "overview",
    label: "Overview",
    sortOrder: 200,
    description:
      "Per-application summary cards: config/catalog/fleet counts and the below-minimum-version warning.",
  },
  {
    key: "configuration",
    label: "Configuration",
    sortOrder: 300,
    description:
      "Remote runtime configuration rows (app_config) and which one, if any, is open in the editor.",
  },
  {
    key: "catalogs",
    label: "Catalogs",
    sortOrder: 400,
    description:
      "Remote catalog entries (catalog_entries) for the selected application, grouped by kind, and the editor view.",
  },
  {
    key: "installations",
    label: "Installations",
    sortOrder: 500,
    description:
      "The installed fleet (app_instances) and its standing against the live minimum supported version.",
  },
  {
    key: "history",
    label: "History",
    sortOrder: 600,
    description:
      "The merged configuration + catalog audit timeline and how far back it currently loads.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Applications hub ─────────────────────────────────────────────────────
  {
    name: "active_tab",
    label: "Active tab",
    description:
      'Which tab of the Applications hub is showing: "overview", "configuration", "catalogs", "installations", or "history". Derived from the pathname under /administration/applications. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 14,
    sortOrder: 100,
    group: "hub",
  },

  // ── Overview ─────────────────────────────────────────────────────────────
  {
    name: "application_count",
    label: "Application count",
    description:
      "Number of distinct applications known to the hub — the union of apps with a config row, a catalog entry, or an installed instance. Absent outside the Overview tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 200,
    group: "overview",
  },
  {
    name: "applications_overview_summary",
    label: "Applications overview summary",
    description:
      "One entry per known application: app slug, schema version, minimum supported version, config URL/flag counts, catalog totals (total/active/kinds), and fleet totals (total/recent/below-minimum/unreported). Absent outside the Overview tab.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 210,
    group: "overview",
  },
  {
    name: "fleet_below_minimum_total",
    label: "Fleet below minimum (total)",
    description:
      "Sum, across every application, of installed instances reporting a version below that application's published min_supported_app_version — the number the destructive banner names. Absent outside the Overview tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 220,
    group: "overview",
  },

  // ── Configuration ────────────────────────────────────────────────────────
  {
    name: "config_row_count",
    label: "Configuration row count",
    description:
      "Number of app_config rows loaded into the Configuration tab's table. Absent outside the Configuration tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 300,
    group: "configuration",
  },
  {
    name: "config_rows_summary",
    label: "Configuration rows summary",
    description:
      "One entry per app_config row: app slug, schema_version, min_supported_app_version, updated_at, updated_by. Bindable rather than auto-context — the full config JSONB is not included here. Absent outside the Configuration tab.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 310,
    group: "configuration",
  },
  {
    name: "config_editor_view",
    label: "Configuration editor view",
    description:
      'Client-side view mode of the Configuration tab: "list" (table), "edit" (an existing app open in the editor), or "new" (creating a row). Absent outside the Configuration tab.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 320,
    group: "configuration",
  },
  {
    name: "config_editor_app",
    label: "Configuration editor app",
    description:
      'App slug currently open in the Configuration editor. Empty when config_editor_view is "list" or "new". Absent outside the Configuration tab.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 330,
    group: "configuration",
  },

  // ── Catalogs ─────────────────────────────────────────────────────────────
  {
    name: "catalog_selected_app",
    label: "Catalog selected application",
    description:
      "App slug the Catalogs tab's app selector is currently filtered to (defaults to the DEFAULT_CATALOG_APP constant). Absent outside the Catalogs tab.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 400,
    group: "catalogs",
  },
  {
    name: "catalog_entry_count",
    label: "Catalog entry count",
    description:
      "Number of catalog_entries rows belonging to catalog_selected_app. Absent outside the Catalogs tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 410,
    group: "catalogs",
  },
  {
    name: "catalog_kind_summary",
    label: "Catalog kind summary",
    description:
      "One entry per catalog kind for the selected app: slug, label, registered status, total entries, active entries. Absent outside the Catalogs tab.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 420,
    group: "catalogs",
  },
  {
    name: "catalog_view",
    label: "Catalog editor view",
    description:
      'Client-side view mode of the Catalogs tab: "kinds" (dashboard), "kind" (one kind\'s table), "edit" (an existing entry open), or "new" (creating an entry). Absent outside the Catalogs tab.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 430,
    group: "catalogs",
  },
  {
    name: "catalog_selected_kind",
    label: "Catalog selected kind",
    description:
      'Kind slug currently open (catalog_view "kind", "edit", or "new"). Empty when catalog_view is "kinds". Absent outside the Catalogs tab.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 440,
    group: "catalogs",
  },
  {
    name: "catalog_selected_entry_id",
    label: "Catalog selected entry id",
    description:
      'UUID of the catalog_entries row open in the editor (catalog_view "edit" only). Absent otherwise, and outside the Catalogs tab.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 450,
    group: "catalogs",
  },

  // ── Installations ────────────────────────────────────────────────────────
  {
    name: "installation_app",
    label: "Installations application",
    description:
      "The single application the Installations tab's fleet belongs to (app_instances is single-app; the DEFAULT_APPLICATION constant). Absent outside the Installations tab.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 500,
    group: "installations",
  },
  {
    name: "installation_count",
    label: "Installation count",
    description:
      "Number of checked-in app_instances rows loaded into the Installations table. Absent outside the Installations tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 510,
    group: "installations",
  },
  {
    name: "installation_below_min_count",
    label: "Installations below minimum",
    description:
      "Number of installed instances whose reported app_version is below installation_min_supported_version. Absent outside the Installations tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 520,
    group: "installations",
  },
  {
    name: "installation_min_supported_version",
    label: "Installations minimum supported version",
    description:
      "The live min_supported_app_version published in app_config for installation_app, used as the compliance line for every row. Absent outside the Installations tab; null when the application has no configuration row.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 530,
    group: "installations",
  },

  // ── History ──────────────────────────────────────────────────────────────
  {
    name: "history_entry_count",
    label: "History entry count",
    description:
      "Number of merged timeline entries currently loaded (configuration + catalog changes combined, newest first). Absent outside the History tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 600,
    group: "history",
  },
  {
    name: "history_fetch_limit",
    label: "History fetch limit",
    description:
      "Per-source row cap currently in effect (starts at 100; widens by the same amount each time the admin clicks Load more). Absent outside the History tab.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 610,
    group: "history",
  },
];

export const adminApplicationsManifest: SurfaceManifest = {
  surfaceName: ADMIN_APPLICATIONS_SURFACE_NAME,
  readiness: "verified",
  label: "Applications",
  urlPattern: "/administration/applications",
  intro: `<surface_intro>
This is an ADMIN surface: the Applications hub at /administration/applications — the console governing every shipped Matrx CLIENT (desktop, browser extension, mobile), not user-created agent apps. Five tabs: Overview, Configuration, Catalogs, Installations, History.

active_tab tells you which tab the admin is on right now and is always present. On Overview, applications_overview_summary and fleet_below_minimum_total describe every known application's config/catalog/fleet standing. On Configuration, config_rows_summary lists the remote runtime config for each application and config_editor_view/config_editor_app say whether one is open for editing. On Catalogs, catalog_kind_summary breaks down remote catalog entries by kind for catalog_selected_app, and catalog_view/catalog_selected_kind/catalog_selected_entry_id track the drill-down. On Installations, the fleet is compared against installation_min_supported_version, with installation_below_min_count naming instances running unsupported builds. On History, history_entry_count and history_fetch_limit describe the merged audit timeline window.

Only the values matching active_tab are populated — each tab mounts its own nested emitter, so everything belonging to another tab is absent, not stale.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminApplicationsScope(values: {
  // alwaysAvailable: true → required
  active_tab:
    | "overview"
    | "configuration"
    | "catalogs"
    | "installations"
    | "history";
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  application_count?: number;
  applications_overview_summary?: unknown[];
  fleet_below_minimum_total?: number;
  config_row_count?: number;
  config_rows_summary?: unknown[];
  config_editor_view?: "list" | "edit" | "new";
  config_editor_app?: string;
  catalog_selected_app?: string;
  catalog_entry_count?: number;
  catalog_kind_summary?: unknown[];
  catalog_view?: "kinds" | "kind" | "edit" | "new";
  catalog_selected_kind?: string;
  catalog_selected_entry_id?: string;
  installation_app?: string;
  installation_count?: number;
  installation_below_min_count?: number;
  installation_min_supported_version?: string | null;
  history_entry_count?: number;
  history_fetch_limit?: number;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
