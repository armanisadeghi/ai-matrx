import type { SurfaceManifest, SurfaceScopePayload, SurfaceValue, SurfaceValueGroup } from "@/features/surfaces/types";
import { mergeBaselineValues } from "./_baseline.manifest";

export const ADMIN_SYNC_FLEET_SURFACE_NAME = "matrx-admin/sync-fleet";

const groups: SurfaceValueGroup[] = [{ key: "fleet", label: "Sync fleet", sortOrder: 100, description: "The organization-scoped sync mapping health rows currently visible to this administrator." }];
const values: SurfaceValue[] = [
  { name: "sync_mappings", label: "Sync mappings", description: "Every sync mapping status row available to this administrator. Empty when none are available.", valueType: "array", alwaysAvailable: true, typicalCharCount: 8000, autoContext: false, group: "fleet", sortOrder: 100 },
  { name: "sync_mapping_count", label: "Sync mapping count", description: "Number of sync mapping rows available to this administrator. Always present.", valueType: "number", alwaysAvailable: true, typicalCharCount: 4, group: "fleet", sortOrder: 110 },
];
export const adminSyncFleetManifest: SurfaceManifest = { surfaceName: ADMIN_SYNC_FLEET_SURFACE_NAME, label: "Sync fleet", readiness: "partial", readinessNote: "The table is registered and emits its loaded fleet; canonical context-menu wiring remains to be audited.", urlPattern: "/administration/applications/sync", intro: `<surface_intro>This administrator view shows path-free sync fleet health for organizations the current person administers. Sync mapping rows contain states, timestamps, and counts; local folders are never present.</surface_intro>`, groups, values: mergeBaselineValues([], values) };
export function createAdminSyncFleetScope(values: { sync_mappings: unknown[]; sync_mapping_count: number }): SurfaceScopePayload { return values as SurfaceScopePayload; }
