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

/**
 * Link row projected with the canonical source/target URL references.
 *
 * `snapshot` is embedded ONLY by the crawl-scoped read (it is how a session is
 * filtered). The site-scoped read deliberately omits the join — PostgREST's
 * embedded join over a 100k-edge site hits a statement timeout — so consumers
 * must fall back to `created_at` when it is absent.
 */
export type InspectionLinkRow = InspectionLinkEdge & {
  source_page: InspectionPageReference | null;
  target_page: InspectionPageReference | null;
  snapshot?: InspectionSnapshotReference | null;
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

/**
 * Minimal snapshot projection for duplicate-content clustering — the whole
 * session is fetched, so only the fingerprint sub-path of `extracted` rides
 * along (`extracted->fingerprint`), never the full evidence blob.
 */
export type CrawlFingerprintQueryRow = Pick<
  InspectionSnapshot,
  "id" | "page_id" | "final_url" | "word_count"
> & {
  fingerprint: InspectionSnapshot["extracted"] | null;
  page: InspectionPageReference | null;
};

/** Session-wide fingerprint fetch — capped at a hard row limit, flagged when hit. */
export interface CrawlFingerprintResult {
  rows: CrawlFingerprintQueryRow[];
  total: number;
  truncated: boolean;
}

/**
 * Minimal snapshot projection for canonical-chain resolution — the whole
 * session's observed canonicals ride along as one SQL-projected string
 * (`head_tags->>canonical_url`), never the full head_tags blob.
 */
export type CrawlCanonicalQueryRow = Pick<
  InspectionSnapshot,
  "id" | "page_id" | "final_url" | "http_status"
> & {
  canonical_url: string | null;
  page: InspectionPageReference | null;
};

/** Session-wide canonical-map fetch — capped at a hard row limit, flagged when hit. */
export interface CrawlCanonicalMapResult {
  rows: CrawlCanonicalQueryRow[];
  total: number;
  truncated: boolean;
}
