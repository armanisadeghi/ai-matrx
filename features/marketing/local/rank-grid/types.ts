// features/marketing/local/rank-grid/types.ts — what `seo_local` answers for
// the three actions the rank-grid screen calls, inside the `seo.tool_envelope`.
// Shapes mirror aidream `services/seo/local_toolset.py` (`find_business`,
// `rank_grid`) and `matrx_seo/local_grid.py` (`PointResult.as_dict`, `summarize`).

export const SEO_LOCAL_TOOL = "seo_local";

export type GridSize = 3 | 5;
export type GridDevice = "mobile" | "desktop";

/** One location `find_business` returned (FIND_KEYS). */
export interface BusinessCandidate {
  name: string | null;
  cid: string | null;
  place_id: string | null;
  category: string | null;
  rating: number | null;
  review_count: number | null;
  claimed: boolean | null;
  url: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  distance_km: number | null;
}

export interface FindBusinessData {
  query: string;
  near: { label: string; lat: number; lng: number; source: string };
  count: number;
  complete: boolean | null;
  candidates: BusinessCandidate[];
}

/** The storefront the person confirmed: what every grid call names. */
export interface ConfirmedBusiness {
  name: string;
  cid: string | null;
  place_id: string | null;
  address: string | null;
  lat: number;
  lng: number;
}

/** The business as stored evidence last saw it (`stored_business`), or the grid's match. */
export interface MatchedBusiness {
  name: string | null;
  cid: string | null;
  place_id: string | null;
  address: string | null;
  lat?: number | null;
  lng?: number | null;
  matched_by?: "cid" | "place_id" | "name" | null;
  observed_at?: string | null;
}

export interface GridCenter {
  latitude: number;
  longitude: number;
  source: string;
}

export interface GridPreviewData {
  preview: true;
  center: GridCenter;
  center_confirmed_value: string;
  matched_business: MatchedBusiness | null;
  center_to_listing_km: number | null;
  keyword: string;
  grid_size: number;
  spacing_km: number;
  zoom: number;
  depth: number;
  device: GridDevice;
  points: { row: number; col: number; lat: number; lng: number }[];
  estimate_usd: number;
  reused_points: number;
  always_asks_approval: boolean;
}

export type NotFoundReading = "no_results" | "sparse" | "outranked";

export interface GridPoint {
  row: number;
  col: number;
  lat: number;
  lng: number;
  rank: number | null;
  results_count: number | null;
  top_result: { name: string | null; cid: string | null } | null;
  error?: string;
  run_id?: string;
  pending?: boolean;
  not_found_reading?: NotFoundReading | null;
}

export interface GridSummary {
  points_found: number;
  points_searched: number;
  points_failed: number;
  points_pending: number;
  avg_rank: number | null;
  top3: number;
  top10: number;
}

export interface GridResultData {
  keyword: string;
  grid_size: number;
  spacing_km: number;
  zoom: number;
  depth: number;
  device: GridDevice;
  center: GridCenter;
  matched_business: MatchedBusiness | null;
  summary: GridSummary;
  grid_text: string;
  points: GridPoint[];
}

/** The grid settings the person chose; one preview and one run share them. */
export interface GridRequest {
  keyword: string;
  gridSize: GridSize;
  spacingKm: number;
  device: GridDevice;
}
