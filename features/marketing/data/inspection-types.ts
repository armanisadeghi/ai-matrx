import type { Database } from "@/types/database.types";

type WebTables = Database["web"]["Tables"];

export type InspectionLinkEdge = WebTables["link_edge"]["Row"];
export type InspectionPage = WebTables["page"]["Row"];
export type InspectionScreenshot = WebTables["screenshot"]["Row"];
export type InspectionSnapshot = WebTables["snapshot"]["Row"];

export type InspectionPageReference = Pick<InspectionPage, "url">;
export type InspectionSnapshotReference = Pick<
  InspectionSnapshot,
  "captured_at" | "session_id"
>;

/** Link row projected with the canonical source/target URL references. */
export type InspectionLinkRow = InspectionLinkEdge & {
  source_page: InspectionPageReference | null;
  target_page: InspectionPageReference | null;
  snapshot: InspectionSnapshotReference | null;
};

/** Minimal link-edge projection fetched for the link-graph visualization. */
export type LinkGraphEdgeRow = Pick<
  InspectionLinkEdge,
  | "id"
  | "source_page_id"
  | "target_url"
  | "target_page_id"
  | "is_internal"
  | "rel"
  | "anchor_text"
  | "http_status"
> & {
  source_page: InspectionPageReference | null;
};

/** Link-graph fetch result — capped at a hard row limit, flagged when hit. */
export interface LinkGraphEdgeResult {
  rows: LinkGraphEdgeRow[];
  total: number;
  truncated: boolean;
}

/** Snapshot row projected with its crawl-independent canonical page URL. */
export type InspectionSnapshotRow = InspectionSnapshot & {
  page: InspectionPageReference | null;
};

/** Screenshot row projected with its optional canonical page URL. */
export type InspectionScreenshotRow = InspectionScreenshot & {
  page: InspectionPageReference | null;
};

export interface InspectionPagedResult<T> {
  rows: T[];
  total: number;
}
