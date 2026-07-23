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
