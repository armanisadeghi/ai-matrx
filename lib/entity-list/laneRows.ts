// lib/entity-list/laneRows.ts
//
// THE LANE READER'S CLIENT HALF, for a small list that does not page on the
// server. Its `<type>_list_lanes(p_org_id)` function (SECURITY INVOKER — row
// security stays the ceiling) answers one row per (lane, record) for every lane
// the type holds: `public.webhook_list_lanes`, `public.sandbox_instance_list_lanes`,
// `public.saved_view_list_lanes`. The page reads it ONCE with `p_org_id` NULL and
// everything on screen comes from those rows:
//
//   - the rows a lane shows  → `laneIds(rows, lane, orgId)`
//   - every lane's tab count → `laneCounts(rows, lanes, orgId)` (same rows, so a
//     count can never disagree with the list under it)
//   - the per-organization counts beside the organization filter (`narrow.all`)
//
// A list that pages server-side uses a `<feature>_list_scoped` RPC instead
// (lib/list-scope/FEATURE.md § Scoped-list RPCs).

import type { ListScopeKind } from "@/lib/list-scope/types";
import type { EntityScopeCounts } from "./types";

export interface LaneRow {
  id: string;
  lane: string;
  organization_id: string | null;
}

function inOrg(row: LaneRow, orgId: string | null): boolean {
  return orgId === null || row.organization_id === orgId;
}

/** The record ids a lane shows, narrowed by the organization filter (null = All organizations). */
export function laneIds(
  rows: readonly LaneRow[],
  lane: ListScopeKind,
  orgId: string | null,
): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.lane === lane && inOrg(row, orgId)) ids.add(row.id);
  }
  return ids;
}

/**
 * True counts for every lane the surface offers (0 when the lane holds nothing),
 * under the organization filter, plus the All-lane count per organization for
 * the filter's menu (which ignores the filter, so every organization keeps its number).
 */
export function laneCounts(
  rows: readonly LaneRow[],
  lanes: readonly ListScopeKind[],
  orgId: string | null,
): EntityScopeCounts {
  const byKind: EntityScopeCounts["byKind"] = {};
  for (const lane of lanes) byKind[lane] = laneIds(rows, lane, orgId).size;
  const perOrg = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.lane !== "all" || !row.organization_id) continue;
    const ids = perOrg.get(row.organization_id) ?? new Set<string>();
    ids.add(row.id);
    perOrg.set(row.organization_id, ids);
  }
  return {
    byKind,
    narrow: {
      all: [...perOrg].map(([id, ids]) => ({ id, label: "", count: ids.size })),
    },
  };
}
