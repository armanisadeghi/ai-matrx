/**
 * Pure scope builder for the UI Surfaces registry page
 * (`matrx-admin/ui-surfaces`, `/administration/ui/surfaces`).
 *
 * Called by `SurfacesContainer` with state the page already rendered — it
 * never fetches (the runtime polls it every 400 ms). Not loaded yet → the
 * registry keys are omitted; a failed load reports only `load_state`.
 */

import type { SurfaceScopePayload } from "@/features/surfaces/types";
import {
  createAdminUiSurfacesScope,
  type UiSurfaceScopeEntry,
  type UiSurfacesFilterScope,
  type UiSurfacesRegistryCounts,
} from "@/features/surfaces/manifests/admin-ui-surfaces.manifest";
import {
  readinessBucketOf,
  tierFor,
  type SurfaceWithStats,
} from "@/features/surfaces/services/surfaces.service";
import { surfaceCheckState } from "@/features/surfaces/utils/surface-check-ledger";
import type { SurfacesFilterState } from "@/features/surfaces/components/SurfacesFilterBar";
import { xmlElement, xmlList } from "@/features/surfaces/runtime/context-bundle";
import type { NewSurfaceDraftScope } from "@/features/surfaces/components/NewSurfaceDialog";

/** How many rows `surface_list` carries up front (~4,000 chars). */
export const SURFACE_LIST_MAX_ROWS = 40;

export type UiSurfacesDialog =
  | "new_surface"
  | "new_client"
  | "candidates"
  | "sync_manifests"
  | "drift_report";

export interface UiSurfacesScopeInput {
  loading: boolean;
  error: string | null;
  /** Every row loaded (empty until the first successful load). */
  surfaces: readonly SurfaceWithStats[];
  /** The rows after the page's own filters, in the page's order. */
  visible: readonly SurfaceWithStats[];
  clientNames: readonly string[];
  manifestedNames: ReadonlySet<string>;
  filters: SurfacesFilterState;
  readinessCounts: UiSurfacesRegistryCounts["readiness"];
  candidatesAvailable: number;
  /** The drift report's total (countDriftIssues); null until it loads. */
  driftIssues: number | null;
  peekedName: string | null;
  openDialog: UiSurfacesDialog | null;
  /** The New surface dialog's live values; null while it is closed. */
  newSurfaceDraft: NewSurfaceDraftScope | null;
}

export function filtersToScope(f: SurfacesFilterState): UiSurfacesFilterScope {
  return {
    client: f.client === "__all__" ? "all" : f.client,
    status: f.status,
    check_age: f.checked,
    manifest: f.manifest,
    parent:
      f.parent === "__all__" ? "all" : f.parent === "__none__" ? "none" : f.parent,
    readiness: f.readiness,
  };
}

export function toSurfaceScopeEntry(
  row: SurfaceWithStats,
  manifestedNames: ReadonlySet<string>,
): UiSurfaceScopeEntry {
  return {
    name: row.name,
    label: row.label ?? null,
    client_name: row.client_name,
    executor_name: row.executor_name ?? null,
    parent_surface_name: row.parent_surface_name ?? null,
    sort_order: row.sort_order,
    tier: tierFor(row.sort_order).label,
    is_active: row.is_active !== false,
    readiness: readinessBucketOf(row),
    readiness_note: row.readiness_note ?? null,
    has_manifest: manifestedNames.has(row.name),
    value_count: row.surfaceValueCount,
    agent_count: row.agentCount,
    tool_count: row.toolCount,
    check_state: surfaceCheckState(row),
    last_checked_at: row.last_checked_at ?? null,
    last_checked_by: row.last_checked_by ?? null,
    url_pattern: row.url_pattern ?? null,
    description: row.description ?? null,
  };
}

/** The condensed on-screen list as one XML bundle. */
export function buildSurfaceListBundle(
  visible: readonly SurfaceWithStats[],
  manifestedNames: ReadonlySet<string>,
  filters: UiSurfacesFilterScope,
): string {
  const active = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== "all"),
  );
  return (
    xmlList(
      "surfaces",
      visible,
      (row) =>
        xmlElement("s", {
          name: row.name,
          label: row.label,
          client: row.client_name,
          parent: row.parent_surface_name,
          tier: `${tierFor(row.sort_order).label} ${row.sort_order}`,
          readiness: readinessBucketOf(row),
          values: row.surfaceValueCount,
          agents: row.agentCount,
          tools: row.toolCount,
          checked: surfaceCheckState(row),
          active: row.is_active !== false,
          manifest: manifestedNames.has(row.name),
        }),
      { maxRows: SURFACE_LIST_MAX_ROWS, attrs: active },
    ) || "<surfaces total=\"0\"/>"
  );
}

export function buildUiSurfacesScope(
  input: UiSurfacesScopeInput,
): SurfaceScopePayload {
  const filters = filtersToScope(input.filters);
  const extras = {
    ...(input.peekedName ? { peeked_surface: input.peekedName } : {}),
    ...(input.openDialog ? { open_dialog: input.openDialog } : {}),
    ...(input.newSurfaceDraft ? { new_surface_draft: input.newSurfaceDraft } : {}),
  };
  if (input.error) {
    return createAdminUiSurfacesScope({
      load_state: `error: ${input.error}`,
      filters,
      ...extras,
    });
  }
  if (input.loading && input.surfaces.length === 0) {
    return createAdminUiSurfacesScope({ load_state: "loading", filters, ...extras });
  }
  const surfaces = input.surfaces.map((s) =>
    toSurfaceScopeEntry(s, input.manifestedNames),
  );
  return createAdminUiSurfacesScope({
    load_state: "ready",
    filters,
    surface_list: buildSurfaceListBundle(input.visible, input.manifestedNames, filters),
    surfaces,
    registry_counts: {
      total: surfaces.length,
      active: surfaces.filter((s) => s.is_active).length,
      manifests: input.manifestedNames.size,
      unused: surfaces.filter((s) => s.agent_count === 0 && s.tool_count === 0)
        .length,
      visible: input.visible.length,
      readiness: input.readinessCounts,
      candidates_available: input.candidatesAvailable,
      ...(input.driftIssues !== null ? { drift_issues: input.driftIssues } : {}),
    },
    client_names: [...input.clientNames],
    ...extras,
  });
}
