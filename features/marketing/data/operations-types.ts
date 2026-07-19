import type { Database } from "@/types/database.types";

type WebTables = Database["web"]["Tables"];
type WebViews = Database["web"]["Views"];

export type OperationsBatchJob = WebTables["batch_job"]["Row"];
export type OperationsBatchItem = WebTables["batch_item"]["Row"];
export type OperationsAnalysisItem = WebTables["analysis_item"]["Row"];
export type OperationsProvider = WebTables["provider"]["Row"];
export type OperationsSite = WebTables["site"]["Row"];

export type OperationsCostByClient = WebViews["v_cost_by_client"]["Row"];
export type OperationsCostByItem = WebViews["v_cost_by_item"]["Row"];
export type OperationsCostByPage = WebViews["v_cost_by_page"]["Row"];
export type OperationsCostByRun = WebViews["v_cost_by_run"]["Row"];
export type OperationsCostBySite = WebViews["v_cost_by_site"]["Row"];

type ProviderReference = Pick<OperationsProvider, "key" | "kind" | "label">;
type SiteReference = Pick<
  OperationsSite,
  "domain" | "name" | "organization_id"
>;
type AnalysisItemReference = Pick<
  OperationsAnalysisItem,
  "category" | "key" | "label" | "subcategory"
>;

/** Workspace batch row with human-readable provider and site references. */
export type OperationsBatchRow = OperationsBatchJob & {
  provider: ProviderReference | null;
  site: SiteReference | null;
};

/** Batch execution unit with its catalog item, provider, and attributed cost. */
export type OperationsBatchItemRow = OperationsBatchItem & {
  item: AnalysisItemReference | null;
  provider: ProviderReference | null;
  cost: number;
};

export type SiteCostMode = "item" | "page" | "run";
export type WorkspaceCostMode = "client" | "site";

/** Normalized row used by the site cost explorer across three cost views. */
export interface SiteCostRow {
  id: string;
  mode: SiteCostMode;
  label: string;
  cost: number;
  page_id: string | null;
  run_id: string | null;
  batch_id: string | null;
  batch_item_id: string | null;
}

/** Normalized row used by the workspace cost explorer. */
export interface WorkspaceCostRow {
  id: string;
  mode: WorkspaceCostMode;
  label: string;
  detail: string | null;
  cost: number;
  site_id: string | null;
  client_org_id: string | null;
}

export interface OperationsPagedResult<T> {
  rows: T[];
  total: number;
}

export function siteCostMode(value: string): SiteCostMode {
  return value === "run" || value === "item" ? value : "page";
}

export function workspaceCostMode(value: string): WorkspaceCostMode {
  return value === "client" ? "client" : "site";
}
