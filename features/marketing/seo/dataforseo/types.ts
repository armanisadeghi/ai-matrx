export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface DataForSeoEndpointExample {
  endpoint: string;
  workflow: "live" | "standard";
  task: Record<string, JsonValue>;
}

export interface DataForSeoOperation {
  name: string;
  family: string;
  capabilities: string[];
  endpoints: string[];
  workflows: Array<"live" | "standard">;
  pricing_key: string;
  raw_only: boolean;
  canonical_normalizer: boolean;
  freshness_ttl_seconds: number;
  endpoint_examples: DataForSeoEndpointExample[];
}

export interface DataForSeoOperationsResponse {
  operations: DataForSeoOperation[];
}

export interface CollectionReceipt {
  run_id: string;
  raw_payload_id: string | null;
  created_observations: number;
  existing_observations: number;
  reused_completed_run: boolean;
  from_cache: boolean;
  cache_age_seconds: number | null;
  freshness_ttl_seconds: number | null;
}

export interface ProviderCallEvidence {
  id: string;
  provider_call_key: string;
  external_task_id: string | null;
  request_count: number;
  reported_cost: string | number | null;
  estimated_cost: string | number | null;
  currency: string;
  fetched_at: string;
  metadata: Record<string, JsonValue>;
}

export interface ProviderTaskEvidence {
  id: string;
  external_task_id: string;
  endpoint: string | null;
  status: string;
  request_payload: Record<string, JsonValue>;
  response_payload: Record<string, JsonValue> | null;
  request_count: number;
  provider_cost: string | number | null;
  estimated_cost: string | number | null;
  currency: string;
  submitted_at: string;
  last_polled_at: string | null;
  completed_at: string | null;
  error: Record<string, JsonValue> | null;
}

export interface RawPayloadEvidence {
  id: string;
  checksum: string;
  size_bytes: number;
  content_type: string;
  payload: JsonValue | null;
  cloud_file_id: string | null;
  provider_schema_version: string | null;
  external_task_id: string | null;
  fetched_at: string;
  offload_error: Record<string, JsonValue> | null;
  created_at: string;
}

export interface RunEvidence {
  run_id: string;
  provider: string;
  operation: string;
  request: Record<string, JsonValue>;
  provider_calls: ProviderCallEvidence[];
  provider_tasks: ProviderTaskEvidence[];
  raw_payloads: RawPayloadEvidence[];
}

export interface CollectionCreateBody {
  provider: "dataforseo";
  organization_id: string;
  capability: "raw_provider" | "keyword_metrics" | "backlinks";
  operation: string;
  target_ref: string;
  site_id?: string;
  page_id?: string;
  source_crawl_session_id?: string;
  enrichment_limit?: number;
  observation_period: string;
  settings: {
    tasks: Array<Record<string, JsonValue>>;
    workflow: "live" | "standard";
    endpoint?: string;
  };
  request_id: string;
  force_refresh: boolean;
}

export type BacklinkRefreshProfile = "weekly" | "monthly" | "bootstrap";

export interface BacklinkRefreshBody {
  organization_id: string;
  profile: BacklinkRefreshProfile;
  detail_limit: number;
  force_refresh: boolean;
  request_id?: string;
  source_crawl_session_id?: string;
  enrichment_limit?: number;
}

export interface BacklinkDatasetReceipt {
  dataset: string;
  operation: string;
  endpoint: string;
  receipt: CollectionReceipt;
}

export interface BacklinkRefreshReceipt {
  site_id: string;
  target: string;
  profile: BacklinkRefreshProfile;
  datasets: BacklinkDatasetReceipt[];
}

export interface PageLinkGapBody {
  opportunity_ids: string[];
  limit?: number;
  max_spam_score?: number;
  force_refresh?: boolean;
  request_id?: string;
}

export interface PageLinkGapReceipt {
  page_id: string;
  page_url: string;
  competitor_pages: string[];
  opportunity_ids: string[];
  receipt: CollectionReceipt;
}

/**
 * The site-wide competitor link gap: "who links to my competitors and not to
 * me?". Both the no-spend seed preview and the paid streamed run take this
 * body — one shape, so the preview can never be computed from a different
 * request than the run it previews.
 */
export interface SiteLinkGapBody {
  competitor_ids?: string[];
  limit?: number;
  max_spam_score?: number;
  force_refresh?: boolean;
  request_id?: string;
}

/** One competitor the run WOULD compare against, with why it qualifies. */
export interface SeededCompetitor {
  competitor_id: string;
  domain: string;
  entity_role: string | null;
  business_overlap: string | null;
  market_overlap: string | null;
  explicitly_enabled: boolean;
}

/**
 * The answer to "what would this cost me and who would it look at?" — returned
 * by `/link-gap/seed`, which spends NOTHING. `can_run: false` carries a
 * plain-language `reason` written for the user (today: no competitor has been
 * confirmed yet), and the surface renders it as the next step, never an error.
 */
export interface SiteLinkGapSeedResponse {
  site_id: string;
  can_run: boolean;
  seeded: SeededCompetitor[];
  excluded: string[];
  reason: string | null;
  confirmed_competitors: number;
  total_competitors: number;
}

/** Terminal receipt of the paid site-wide run (`seo.site_link_gap_completed`). */
export interface DomainLinkGapReceipt {
  site_id: string;
  site_domain: string;
  seeded: SeededCompetitor[];
  excluded: string[];
  receipt: CollectionReceipt;
}

/** One prospect domain resolved into a CRM organization by the server fold. */
export interface FoldedLinkGapDomain {
  domain: string;
  party_id: string;
  display_name: string;
  created: boolean;
  matched_by: string;
  provenance_edge: boolean;
}

/** A row the fold deliberately did NOT turn into a CRM record, and why. */
export interface SkippedLinkGapDomain {
  domain: string;
  row_id: string;
  reason: string;
}

/**
 * What the CRM fold did. Only APPROVED prospects are folded; everything else
 * comes back in `skipped` with its current review state, so the backlog
 * waiting on a human decision is visible instead of silent.
 */
export interface LinkGapFoldReport {
  source: string;
  site_id: string;
  organization_id: string;
  scanned: number;
  already_linked: number;
  created: number;
  matched: number;
  folded: FoldedLinkGapDomain[];
  skipped: SkippedLinkGapDomain[];
  errors: string[];
}

export interface BacklinkEnrichmentResult {
  result_kind: "backlinks.enrich";
  site_id: string;
  requested: number;
  claimed: number;
  completed: number;
  failed: number;
  skipped: number;
  queue: Record<string, number>;
  items: BacklinkEnrichmentItemResult[];
}

export interface BacklinkEnrichmentItemResult {
  backlink_id: string;
  source_url: string;
  status: "completed" | "failed" | "skipped";
  stage: string | null;
  message: string | null;
  overall_score: number | null;
  recommended_action: string | null;
}

export interface SeoStreamEvent {
  kind: string;
  run_id?: string;
  backlink_id?: string;
  backlink_ids?: string[];
  source_url?: string;
  source_urls?: string[];
  candidate_count?: number;
  stage?: string;
  message?: string;
  retryable?: boolean;
  overall_score?: number | null;
  action?: string | null;
  result?: BacklinkEnrichmentResult;
  [key: string]: unknown;
}

export interface BacklinkEnrichmentBody {
  organization_id: string;
  limit: number;
  force: boolean;
  backlink_ids?: string[];
}
