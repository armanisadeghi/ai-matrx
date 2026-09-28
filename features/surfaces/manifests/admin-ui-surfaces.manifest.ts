/**
 * Surface manifest — UI Surfaces registry (`matrx-admin/ui-surfaces`).
 *
 * ADMIN SURFACE. The LIST route `/administration/ui/surfaces` exactly
 * (`app/(admin)/administration/ui/surfaces/page.tsx` →
 * `features/surfaces/components/SurfacesContainer.tsx`): every row of
 * `ui.ui_surface` (the platform's own records — no org or person lanes), with
 * its readiness, its check-ledger age, its synced value / agent / tool counts,
 * and the Drift report / Sync manifests / New client / Candidates actions.
 * The per-surface editor at `/administration/ui/surfaces/<name>` is a
 * different page (one record) and has no surface yet — the route mapping is
 * an exact regex so it never borrows this list's vocabulary.
 *
 * Emitter: `SurfacesContainer.tsx` mounts `<SurfaceRuntimeProvider>` around
 * the canonical right-click menu; the scope is built by the pure
 * `buildUiSurfacesScope` (`features/surfaces/lib/ui-surfaces-scope.ts`) from
 * the rows the page already loaded (never fetches).
 *
 * Write half — ONE record type (surfaces), full list CRUD plus
 * `new_surface_draft` (fills the New surface dialog; nothing saved), all `ask`, through
 * the page's own service functions (`createSurface` / `updateSurface` /
 * `deleteSurface`); pure parsers in `features/surfaces/lib/ui-surfaces-agent-writes.ts`.
 *  - A surface WITH a code manifest is owned by code: the next Sync manifests
 *    rewrites its label, description, parent, url pattern and active flag, so
 *    `update_surfaces` refuses those fields on it (only sort_order and
 *    executor_name stick), and `delete_surfaces` refuses it outright (code owns
 *    it; remove the manifest in code instead).
 *  - Delete means archive (Arman, 2026-09-27): `delete_surfaces` moves the row
 *    to Trash (deleted_at). Config, item types and tool defaults follow via the
 *    platform soft-delete cascade; everything comes back on restore from Trash.
 *
 * NOT writable: UI clients (not listed on this page — they appear only as
 * filter options; the New client dialog stays a human action), readiness and
 * the check ledger (evidence written by the certification loop), and every
 * count (derived).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_UI_SURFACES_SURFACE_NAME = "matrx-admin/ui-surfaces";

const groups: SurfaceValueGroup[] = [
  {
    key: "registry",
    label: "Surface registry",
    sortOrder: 100,
    description:
      "Every UI surface in the registry, the rows the list shows, and the headline counts.",
  },
  {
    key: "view",
    label: "View",
    sortOrder: 200,
    description: "The page's filters, the peeked surface and the open dialog.",
  },
];

const SURFACE_SHAPE =
  "{ name, label, client_name, executor_name, parent_surface_name, sort_order, tier, is_active, readiness, readiness_note, has_manifest, value_count (values saved in the database), declared_value_count (values its code manifest declares; null with no manifest — when the two differ, Sync manifests brings the database up to date), agent_count, tool_count, check_state, last_checked_at, last_checked_by, url_pattern, description }";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "load_state",
    label: "Load state",
    description:
      '"loading" while the registry loads, "ready" after a successful load, or "error: <message>" when it failed (then no counts or rows are reported). Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 100,
    group: "registry",
  },
  {
    name: "surface_list",
    label: "Surfaces on screen",
    description:
      "The rows the list shows after the page's own filters (client, status, check age, manifests, parent, readiness tile), condensed as one XML bundle: <surfaces total shown filters…><s name label client parent tier readiness values declared agents tools checked active manifest/> (values = saved in the database, declared = in its code manifest)…</surfaces>, first 40 in the page's default order (tier, then name). The table's own search box and column sort are not reflected (the table does not report them). Absent until the registry has loaded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 3500,
    inlineUpTo: 4000,
    sortOrder: 105,
    group: "registry",
  },
  {
    name: "surfaces",
    label: "All surfaces",
    description: `Every surface in the registry (every row, not only the filtered ones), each ${SURFACE_SHAPE}. has_manifest is true when a code manifest owns the surface; check_state is "never" | "stale" | "fresh". Use the names with update_surfaces / delete_surfaces. Absent until the registry has loaded.`,
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 60000,
    sortOrder: 110,
    group: "registry",
  },
  {
    name: "registry_counts",
    label: "Registry counts",
    description:
      "{ total, active, manifests, unused, visible, readiness: { verified, partial, stub, unregistered }, candidates_available, drift_issues? } — the numbers in the page's toolbar and readiness tiles. readiness counts follow the client filter, as the tiles do; unused = surfaces with no agents and no tools (the toolbar says 'with no agents or tools'); drift_issues = the Drift report's total issue count (what its button badge shows), omitted until that report loads. Absent until the registry has loaded.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    inlineUpTo: 400,
    sortOrder: 120,
    group: "registry",
  },
  {
    name: "client_names",
    label: "UI clients",
    description:
      "The UI client names a surface can belong to (e.g. matrx-user, matrx-admin). A surface name is always <client>/<local>. Absent until loaded.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 150,
    inlineUpTo: 300,
    sortOrder: 130,
    group: "registry",
  },
  {
    name: "filters",
    label: "Filters",
    description:
      '{ client, status, check_age, manifest, parent, readiness } — the page\'s filters, each "all" when unset. client is a client name; status "active" | "inactive"; check_age "never" | "stale" | "fresh"; manifest "with_manifest" | "without_manifest"; parent a surface name or "none" (root surfaces); readiness "verified" | "partial" | "stub" | "unregistered". Always present.',
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 120,
    inlineUpTo: 300,
    sortOrder: 200,
    group: "view",
  },
  {
    name: "peeked_surface",
    label: "Peeked surface",
    description:
      "The name of the surface open in the side peek panel. Absent when no peek panel is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 210,
    group: "view",
  },
  {
    name: "open_dialog",
    label: "Open dialog",
    description:
      '"new_surface" | "new_client" | "candidates" | "sync_manifests" | "drift_report" when that dialog is open. Absent when none is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 220,
    group: "view",
  },
  {
    name: "new_surface_draft",
    label: "New surface draft",
    description:
      'The New surface dialog\'s live values as { name, client, local, parent_surface_name, tier, description } — name is "<client>/<local>" ("" until both are set); parent_surface_name null means a root surface; tier is the dialog\'s tier label. The read twin of the new_surface_draft write target. Absent while the dialog is closed.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    inlineUpTo: 800,
    sortOrder: 230,
    group: "view",
  },
];

const SURFACE_FIELDS =
  'name: string (required on create; "<client>/<local>", client one of client_names, local lowercase letters, digits, hyphens and slashes, e.g. "matrx-user/notes"), label?: string, description?: string, parent_surface_name?: string | null (an existing surface name; default "matrx-default/default"; null = root), sort_order?: number (a whole number ≥ 100: 100-299 Pages, 300-999 Specialized, 1000-1999 Overlays, 2000-8999 Editor variants, 9000+ Debug; default 150), is_active?: boolean (default true), executor_name?: string | null, url_pattern?: string | null';

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "new_surface_draft",
    label: "New surface form",
    description:
      'Opens the New surface dialog (if closed) and fills it in. NOTHING is saved — the person reviews it and presses Create. Value is a JSON OBJECT (not a string, not an array) with any of: { name: "<client>/<local>" (client one of client_names; local lowercase letters, digits, hyphens, slashes; must not exist yet), parent_surface_name: an existing surface name or null for a root surface, tier: "Pages" | "Specialized" | "Overlays" | "Editor variants" | "Debug", description: string }. Only the fields you send change. Every problem is reported at once and the dialog is left untouched. Use this for one surface the person wants to look over first; to create surfaces directly use create_surfaces.',
    valueType: "object",
    updatesValue: "new_surface_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "view",
    sortOrder: 100,
  },
  {
    name: "create_surfaces",
    label: "Create surfaces",
    description: `Creates one or more UI surface rows in the registry, saved immediately, exactly as the New surface dialog does. Value is a JSON ARRAY (not a string) of 1-25 objects, each { ${SURFACE_FIELDS} }, e.g. [{ "name": "matrx-user/reports", "label": "Reports", "description": "…" }]. The whole list is checked first: a bad name, an unknown client or parent, a sort_order under 100, a name repeated in the list or already in the registry refuses everything, with every problem listed, and nothing is created. A registry row alone does not make a page agent-readable — that needs a code manifest; say so to the person.`,
    valueType: "array",
    updatesValue: "surfaces",
    mode: "entity",
    applyPolicy: "ask",
    group: "registry",
    sortOrder: 110,
  },
  {
    name: "update_surfaces",
    label: "Update surfaces",
    description:
      'Changes one or more surfaces, saved immediately. Value is a JSON ARRAY (not a string) of 1-25 objects, each { name: string (required, from surfaces), description?, parent_surface_name?, sort_order?, is_active?, executor_name?, url_pattern? } — fields read as in create_surfaces; only the fields you send change. is_active: false deactivates a surface (reversible; its bindings are kept). A surface with has_manifest true is owned by its code manifest: Sync manifests rewrites its description, parent, url pattern and active flag, so those fields are REFUSED on it — only sort_order and executor_name may change; to change the rest, change the manifest in code. Unknown names, a name twice, an unknown parent or a surface made its own parent refuse the whole list with nothing changed. The label is not editable here.',
    valueType: "array",
    updatesValue: "surfaces",
    mode: "entity",
    applyPolicy: "ask",
    group: "registry",
    sortOrder: 120,
  },
  {
    name: "delete_surfaces",
    label: "Move surfaces to Trash",
    description:
      'Moves one or more surfaces to Trash (archives them; restorable from Trash with everything intact). Value is a JSON ARRAY (not a string) of surface names, or { name } objects, from surfaces. The surface disappears from the registry and agents stop seeing it; its config, item types and tool defaults move to Trash with it. To only hide a surface, prefer update_surfaces with { "name": "…", "is_active": false }. A surface with has_manifest true is REFUSED (its code manifest owns it — remove the manifest in code). Unknown or repeated names refuse the whole list, with nothing moved.',
    valueType: "array",
    updatesValue: "surfaces",
    mode: "entity",
    applyPolicy: "ask",
    group: "registry",
    sortOrder: 130,
  },
];

export const adminUiSurfacesManifest: SurfaceManifest = {
  surfaceName: ADMIN_UI_SURFACES_SURFACE_NAME,
  client: "matrx-admin",
  executionMode: "python-stream",
  description:
    "UI Surfaces registry admin: every ui_surface row with readiness, check ledger, value/agent/tool counts and filters; create, update, deactivate and move surfaces to Trash (/administration/ui/surfaces).",
  readiness: "partial",
  readinessNote:
    "Emitter and write targets built 2026-09-27 (page-pass). Not yet proven: live surface:probe on the deployed commit, the live agent write test (create two / update one / deactivate one / one refusal) with a DB completeness check, and an outside-helper binding test. surface_list reflects the page's own filters, not the table's search box or column sort (MatrxDataTable does not report its visible rows).",
  label: "UI Surfaces",
  urlPattern: "/administration/ui/surfaces",
  intro: `<surface_intro>
You are on the UI Surfaces registry at /administration/ui/surfaces — an admin page listing every agent surface (a page or window agents can read) with its readiness, when its full check last completed, and how many values, agents and tools it has. surface_list is what the list shows (condensed, first 40); surfaces has every row in full; registry_counts has the headline numbers.

Changes go through these targets, each a JSON array (never a string), and each returns what landed:
- create_surfaces — add registry rows (saved at once). A row alone does not make a page agent-readable; that needs a code manifest.
- update_surfaces — change sort order, executor, and (only on surfaces WITHOUT a code manifest) description, parent, url pattern and active flag. is_active: false deactivates reversibly.
- new_surface_draft — fill the New surface dialog for the person to review and save themselves.
- delete_surfaces — moves surfaces to Trash (restorable); refused for manifested surfaces. To only hide one, use is_active: false.
Never change the registry with generic database or context tools: they skip these checks.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One entry of `surfaces`. */
export interface UiSurfaceScopeEntry {
  name: string;
  label: string | null;
  client_name: string;
  executor_name: string | null;
  parent_surface_name: string | null;
  sort_order: number;
  tier: string;
  is_active: boolean;
  readiness: string;
  readiness_note: string | null;
  has_manifest: boolean;
  value_count: number;
  /** Values the code manifest declares (with inherited ones); null = no manifest. */
  declared_value_count: number | null;
  agent_count: number;
  tool_count: number;
  check_state: string;
  last_checked_at: string | null;
  last_checked_by: string | null;
  url_pattern: string | null;
  description: string | null;
}

export interface UiSurfacesRegistryCounts {
  total: number;
  active: number;
  manifests: number;
  unused: number;
  visible: number;
  readiness: Record<"verified" | "partial" | "stub" | "unregistered", number>;
  candidates_available: number;
  drift_issues?: number;
}

export interface UiSurfacesFilterScope {
  client: string;
  status: string;
  check_age: string;
  manifest: string;
  parent: string;
  readiness: string;
}

/**
 * Type-safe payload helper. Required keys mirror `alwaysAvailable: true`;
 * optional keys mirror `alwaysAvailable: false`.
 */
export function createAdminUiSurfacesScope(values: {
  load_state: string;
  filters: UiSurfacesFilterScope;
  selection?: string;
  context?: Record<string, unknown>;
  surface_list?: string;
  surfaces?: UiSurfaceScopeEntry[];
  registry_counts?: UiSurfacesRegistryCounts;
  client_names?: string[];
  peeked_surface?: string;
  open_dialog?: string;
  new_surface_draft?: {
    name: string;
    client: string;
    local: string;
    parent_surface_name: string | null;
    tier: string;
    description: string;
  };
}): SurfaceScopePayload {
  return values as unknown as SurfaceScopePayload;
}
