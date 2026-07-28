/**
 * Surface manifest — Tool Registry Bundles admin (`matrx-admin/bundles`).
 *
 * ADMIN SURFACE. Drives `/administration/agents/bundles` — a single-page
 * master/detail admin for `tool_bundle` rows (system + personal), their
 * lister tool, and their `tool_bundle_member` rows. Backed by
 * `features/tool-registry/bundles/components/BundlesAdminPage.tsx`.
 *
 * What an agent bound here may safely do: read the bundle list/filter state,
 * the selected bundle's identity and metadata, and its member tools — then
 * help the admin name/describe a new bundle, draft member aliases, or
 * explain what a bundle's lister tool does. It must NOT assume a create/
 * add/remove action has happened; those are the admin clicking Save/Add/
 * Remove in the dialogs.
 *
 * Emitters: NONE YET. `BundlesAdminPage` holds all state as local `useState`
 * (list, filter, search, selected id, member list, dialog state) with no
 * shared scope-building point — see readinessNote.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_BUNDLES_SURFACE_NAME = "matrx-admin/bundles";

const groups: SurfaceValueGroup[] = [
  {
    key: "bundle_list",
    label: "Bundle list",
    sortOrder: 100,
    description: "The bundle list, its filter, and the search box.",
  },
  {
    key: "bundle_detail",
    label: "Bundle detail",
    sortOrder: 200,
    description:
      "The selected bundle's identity, metadata, and member tools.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Bundle list ──────────────────────────────────────────────────────
  {
    name: "bundles_filter",
    label: "Bundle filter",
    description:
      '"active" or "all" — whether the list shows only active bundles or every bundle. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    sortOrder: 100,
    group: "bundle_list",
  },
  {
    name: "bundles_search",
    label: "Bundle search text",
    description:
      "Text currently typed in the bundle search box. Empty when untouched. Always present as a string.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    sortOrder: 110,
    group: "bundle_list",
  },
  {
    name: "bundle_count",
    label: "Bundle count",
    description: "Number of bundles currently loaded into the list.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 120,
    group: "bundle_list",
  },
  {
    name: "bundles_list",
    label: "Bundle list rows",
    description:
      "Every loaded bundle — id, name, description, is_active, is_system. Bindable rather than auto-context; potentially dozens of rows.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 130,
    group: "bundle_list",
  },

  // ── Bundle detail ────────────────────────────────────────────────────
  {
    name: "selected_bundle_id",
    label: "Selected bundle id",
    description:
      "UUID of the bundle open in the detail panel. Empty when no bundle is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 200,
    group: "bundle_detail",
  },
  {
    name: "selected_bundle",
    label: "Selected bundle",
    description:
      "Identity + metadata of the selected bundle: name, description, is_active, is_system, lister_tool_id, metadata JSON. Absent when no bundle is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 210,
    group: "bundle_detail",
  },
  {
    name: "bundle_members",
    label: "Bundle members",
    description:
      "Tools currently in the selected bundle, each with its local alias, sort order, and the underlying tool's name/description. Bindable rather than auto-context. Absent when no bundle is selected; empty array before members load.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 220,
    group: "bundle_detail",
  },
  {
    name: "bundle_member_count",
    label: "Bundle member count",
    description:
      "Number of tools in the selected bundle. Absent when no bundle is selected.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 230,
    group: "bundle_detail",
  },
];

export const adminBundlesManifest: SurfaceManifest = {
  surfaceName: ADMIN_BUNDLES_SURFACE_NAME,
  readiness: "stub",
  readinessNote:
    "Manifest-only — no emitter wired yet. BundlesAdminPage holds list/filter/selection/member state as local useState with no shared scope-building point; wiring a SurfaceRuntimeProvider is a follow-up.",
  label: "Bundles Admin",
  urlPattern: "/administration/agents/bundles",
  intro: `<surface_intro>
This is an ADMIN surface: the Tool Registry bundles console at /administration/agents/bundles.

A bundle (tool_bundle) groups tools under one "lister" tool an agent can expand on demand — system bundles are platform-wide, personal bundles are owned by one user. The page is master/detail: bundles_list is the left sidebar (filtered by bundles_filter / bundles_search), and selecting a row loads selected_bundle plus its bundle_members.

What you may safely do: help the admin name and describe a bundle, draft short local aliases for member tools, and explain what a bundle's lister does. You never create, add, remove, or save anything yourself — those are the admin's own dialog actions.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/** One row in the bundle list. */
export interface AdminBundleListRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_system: boolean;
}

/** The selected bundle's identity + metadata. */
export interface AdminBundleDetail {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_system: boolean;
  lister_tool_id: string | null;
  metadata: Record<string, unknown>;
}

/** One member row in the selected bundle. */
export interface AdminBundleMemberRow {
  tool_id: string;
  tool_name: string;
  tool_description: string | null;
  local_alias: string;
  sort_order: number;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value
 * declared `alwaysAvailable: true`; optional keys mirror `alwaysAvailable:
 * false`.
 */
export function createAdminBundlesScope(values: {
  // alwaysAvailable: true → required
  bundles_filter: "active" | "all";
  bundles_search: string;
  bundle_count: number;
  bundles_list: AdminBundleListRow[];
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  selected_bundle_id?: string;
  selected_bundle?: AdminBundleDetail;
  bundle_members?: AdminBundleMemberRow[];
  bundle_member_count?: number;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
