import type { Database } from "@/types/database.types";
import type { BacklinkChangeKind } from "@/features/marketing/components/backlinks/lib/changes";

export type BacklinkSnapshotRow =
  Database["seo"]["Tables"]["backlink_snapshot"]["Row"];
export type BacklinkObservationRow =
  Database["seo"]["Tables"]["backlink"]["Row"];
export type BacklinkRow = BacklinkObservationRow;
export type ReferringDomainProfileRow =
  Database["seo"]["Tables"]["referring_domain_profile"]["Row"];
export type BacklinkDimensionRow =
  Database["seo"]["Tables"]["backlink_dimension_snapshot"]["Row"];
/**
 * One recorded change to an acquired backlink — written nightly by the server
 * comparison, never by this client. The plain-language verdict for a row
 * lives in `components/backlinks/lib/changes.ts`.
 */
export type BacklinkChangeEventRow =
  Database["seo"]["Tables"]["backlink_change_event"]["Row"];

export interface BacklinkPagedResult<T> {
  rows: T[];
  total: number;
}

/**
 * Counts behind the Link changes KPI band. `alertable` is the set at or above
 * the server's alert floor — the same rows the "Needs your attention" lens
 * lists, so a tile and the table it opens can never disagree.
 */
export interface BacklinkChangeSummary {
  total: number;
  alertable: number;
  byKind: Record<BacklinkChangeKind, number>;
}

export interface BacklinkWorkspaceData {
  latestByDataset: Partial<Record<string, BacklinkSnapshotRow>>;
  referringDomains: BacklinkDimensionRow[];
  anchors: BacklinkDimensionRow[];
  targetPages: BacklinkDimensionRow[];
  competitors: BacklinkDimensionRow[];
  domainProfiles: ReferringDomainProfileRow[];
  enrichment: {
    total: number;
    completed: number;
    awaiting: number;
    failed: number;
    highPriority: number;
    controllable: number;
  };
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
