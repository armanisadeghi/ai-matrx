import type { Database } from "@/types/database.types";

export type BacklinkSnapshotRow =
  Database["seo"]["Tables"]["backlink_snapshot"]["Row"];
export type BacklinkObservationRow =
  Database["seo"]["Tables"]["backlink_observation"]["Row"];
export type BacklinkDimensionRow =
  Database["seo"]["Tables"]["backlink_dimension_snapshot"]["Row"];

export interface BacklinkPagedResult<T> {
  rows: T[];
  total: number;
}

export interface BacklinkWorkspaceData {
  latestByDataset: Partial<Record<string, BacklinkSnapshotRow>>;
  referringDomains: BacklinkDimensionRow[];
  anchors: BacklinkDimensionRow[];
  targetPages: BacklinkDimensionRow[];
  competitors: BacklinkDimensionRow[];
}

/**
 * One period of the new/lost backlink trend (M-61) — merged from
 * `backlink_snapshot` rows dated `timeseries_new_lost_summary` (new/lost
 * counts per period) and `timeseries_summary` (running totals for the same
 * period, when DataForSEO reported one). DataForSEO's timeseries endpoints
 * return one row PER HISTORICAL PERIOD in a single call, so real multi-point
 * history is usually already stored after one bootstrap/weekly refresh —
 * this reads it, it does not synthesize it.
 */
export interface BacklinkTrendPoint {
  observed_at: string;
  new_backlinks: number | null;
  lost_backlinks: number | null;
  net_backlinks: number | null;
  total_backlinks: number | null;
  referring_domains: number | null;
}
