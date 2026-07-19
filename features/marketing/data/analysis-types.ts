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
