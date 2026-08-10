/**
 * Surface manifest — Tool Registry Lookups admin (`matrx-admin/lookups`).
 *
 * ADMIN SURFACE. Drives `/administration/agents/lookups` — tabbed CRUD over
 * three small reference tables: `ui_client`, `ui_surface` (legacy quick
 * editor — the page itself points admins to `/administration/ui/surfaces`
 * for real surface work), and `tool.executor`. Backed by
 * `features/tool-registry/lookups/components/LookupsAdminPage.tsx`.
 *
 * What an agent bound here may safely do: read the active tab and the
 * loaded rows for that tab, then help the admin draft a name/description
 * for a new client, surface, or executor, or explain what an existing row
 * is for. It must NOT assume a create/save/activate/deactivate action has
 * happened; those are the admin's own dialog/toggle actions.
 *
 * Emitters: NONE YET. `LookupsAdminPage` and its three CRUD sub-components
 * hold state as local `useState` with no shared scope-building point — see
 * readinessNote.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_LOOKUPS_SURFACE_NAME = "matrx-admin/lookups";

const groups: SurfaceValueGroup[] = [
  {
    key: "lookups_console",
    label: "Lookups console",
    sortOrder: 100,
    description:
      "Which lookup table tab is active and the rows loaded for each of the three tables.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "lookups_tab",
    label: "Active tab",
    description:
      '"clients", "surfaces", or "executors" — which lookup table the admin is editing. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 100,
    group: "lookups_console",
  },
  {
    name: "ui_clients_list",
    label: "UI clients",
    description:
      "Every row loaded from ui_client: name (PK), description, sort_order, is_active. Bindable rather than auto-context.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 800,
    autoContext: false,
    sortOrder: 110,
    group: "lookups_console",
  },
  {
    name: "ui_client_count",
    label: "UI client count",
    description: "Number of ui_client rows loaded.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    sortOrder: 120,
    group: "lookups_console",
  },
  {
    name: "ui_surfaces_list",
    label: "UI surfaces (legacy tab)",
    description:
      "Every row loaded from ui_surface via this legacy quick editor: name (PK), client_name, description, sort_order, is_active. Bindable rather than auto-context. The canonical surface admin is /administration/ui/surfaces — this tab is a lightweight fallback.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 130,
    group: "lookups_console",
  },
  {
    name: "ui_surface_count",
    label: "UI surface count (filtered)",
    description:
      "Number of ui_surface rows currently visible after the client filter is applied.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 140,
    group: "lookups_console",
  },
  {
    name: "ui_surfaces_client_filter",
    label: "UI surfaces client filter",
    description:
      '"__all__" or a specific ui_client name — filters the UI Surfaces tab table. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 150,
    group: "lookups_console",
  },
  {
    name: "tool_executors_list",
    label: "Tool executors",
    description:
      "Every row loaded from tool.executor: name (PK), description, parent_executor_name, mcp_server_id, is_active, config JSON. Bindable rather than auto-context.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 160,
    group: "lookups_console",
  },
  {
    name: "tool_executor_count",
    label: "Tool executor count",
    description: "Number of tool.executor rows loaded.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 170,
    group: "lookups_console",
  },
];

export const adminLookupsManifest: SurfaceManifest = {
  surfaceName: ADMIN_LOOKUPS_SURFACE_NAME,
  readiness: "stub",
  readinessNote:
    "Manifest-only — no emitter wired yet. LookupsAdminPage's three CRUD sub-components (UiClientCrud/UiSurfaceCrud/ToolExecutorCrud) each hold their own local useState with no shared scope-building point; wiring a SurfaceRuntimeProvider is a follow-up.",
  label: "Tool Registry Lookups Admin",
  urlPattern: "/administration/agents/lookups",
  intro: `<surface_intro>
This is an ADMIN surface: the Tool Registry lookups console at /administration/agents/lookups.

Three reference tables, one per tab (lookups_tab): ui.ui_client (client apps that can hold surfaces), ui.ui_surface (a legacy quick editor — real surface work belongs on /administration/ui/surfaces), and tool.executor (capability providers a tool can bind to, e.g. mcp.<slug>, aidream, matrx-local).

What you may safely do: help the admin draft a clear name/description for a new client, surface, or executor row, or explain what an existing row is for from its fields. You never create, save, activate, or deactivate a row yourself — those are the admin's own dialog and toggle actions.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/** One row from ui_client. */
export interface AdminLookupUiClientRow {
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean | null;
}

/** One row from ui_surface (legacy tab). */
export interface AdminLookupUiSurfaceRow {
  name: string;
  client_name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean | null;
}

/** One row from tool.executor. */
export interface AdminLookupToolExecutorRow {
  name: string;
  description: string | null;
  parent_executor_name: string | null;
  mcp_server_id: string | null;
  is_active: boolean;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value
 * declared `alwaysAvailable: true`; optional keys mirror `alwaysAvailable:
 * false`.
 */
export function createAdminLookupsScope(values: {
  // alwaysAvailable: true → required
  lookups_tab: "clients" | "surfaces" | "executors";
  ui_clients_list: AdminLookupUiClientRow[];
  ui_client_count: number;
  ui_surfaces_list: AdminLookupUiSurfaceRow[];
  ui_surface_count: number;
  ui_surfaces_client_filter: string;
  tool_executors_list: AdminLookupToolExecutorRow[];
  tool_executor_count: number;
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
