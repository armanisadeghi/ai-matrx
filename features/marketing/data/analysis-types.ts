import type { Database } from "@/types/database.types";

type WebTables = Database["web"]["Tables"];
type WebViews = Database["web"]["Views"];

export type MarketingFinding = WebTables["finding"]["Row"];
export type MarketingAnalysisResult = WebTables["analysis_result"]["Row"];
export type MarketingAnalysisItem = WebTables["analysis_item"]["Row"];
export type MarketingPriorityProjection = WebViews["v_priority_queue"]["Row"];

export interface AnalysisPageReference {
  id: string;
  path: string | null;
  url: string;
}

export type AnalysisItemReference = Pick<
  MarketingAnalysisItem,
  | "id"
  | "key"
  | "label"
  | "description"
  | "category"
  | "subcategory"
  | "weight"
  | "score_contract"
  | "severity_map"
>;

export interface PriorityQueueRow extends MarketingPriorityProjection {
  row_key: string;
  page_path: string | null;
  page_url: string | null;
}

export interface FindingListRow extends MarketingFinding {
  page_path: string | null;
  page_url: string | null;
  /**
   * The catalogue's human label for `item_key`, when the catalogue knows it.
   * A brand-new server check has no `analysis_item` row yet — null here is
   * normal and the UI falls back to the humanized key.
   */
  item_label: string | null;
  /**
   * `metadata.reasoning` from the finding's LATEST analysis result — the
   * analyzer's own plain-language sentence about what is wrong. The server
   * writes one on EVERY result, so this is the guaranteed floor the UI can
   * always show, including for item keys this frontend has never seen.
   */
  reasoning: string | null;
}

export interface FindingDetailData {
  finding: MarketingFinding;
  page: AnalysisPageReference | null;
  item: AnalysisItemReference | null;
  firstResult: MarketingAnalysisResult | null;
  lastResult: MarketingAnalysisResult | null;
}

export interface AnalysisPagedResult<T> {
  rows: T[];
  total: number;
}
