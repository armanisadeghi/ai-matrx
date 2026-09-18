"use client";

/**
 * TABLE — the map as rows and columns (`table_default_columns`, hierarchy
 * toggle, sortable + filterable columns).
 *
 * Phase 0 renders the U1 harness so the screen is real and honest today; Lane B
 * replaces the body with `MatrxDataTable` over the same `map_tree` read and the
 * same `selectVisibleMapTopics`.
 */

import type { MapViewProps } from "../components/TopicalMapWorkspaceBody";
import { MapTreeHarness } from "./MapTreeHarness";

export function TableView({ mapId, siteId }: MapViewProps) {
  return <MapTreeHarness mapId={mapId} siteId={siteId} view="table" />;
}
