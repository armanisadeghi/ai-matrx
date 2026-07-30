/**
 * The ONE drill vocabulary: what "drill into this row" means per dimension.
 * Consumed by the floating-panel opener paths (context menu + panel row
 * clicks). The in-page tabs cross-filter through URL state instead
 * (SearchConsoleWorkspace.drillFor) but follow the same dimension pairs.
 */

import type {
  GscBreakdownRow,
  GscDimension,
  GscFilters,
} from "@/features/marketing/search-console/types";
import {
  countryLabel,
  deviceLabel,
} from "@/features/marketing/search-console/types";

export interface PanelDrill {
  dimension: GscDimension;
  filters: Partial<GscFilters>;
  label: string;
}

export function panelDrillFor(
  dimension: GscDimension,
  row: GscBreakdownRow,
): PanelDrill {
  switch (dimension) {
    case "query":
      return {
        dimension: "page",
        filters: { query_eq: row.key },
        label: `Pages for “${row.key}”`,
      };
    case "page":
      return {
        dimension: "query",
        filters: { page_eq: row.key },
        label: `Queries for ${row.key}`,
      };
    case "country":
      return {
        dimension: "device",
        filters: { country: row.key },
        label: `Devices in ${countryLabel(row.key)}`,
      };
    case "device":
      return {
        dimension: "country",
        filters: { device: row.key },
        label: `Countries on ${deviceLabel(row.key)}`,
      };
    case "search_appearance":
      return {
        dimension: "search_appearance",
        filters: { search_appearance: row.key },
        label: `Appearance: ${row.key}`,
      };
  }
}
