import type { components } from "@/types/python-generated/api-types";

type ApiSchemas = components["schemas"];

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

export type PageLinkGapBody = ApiSchemas["PageLinkGapBody"];

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
 *
 * These are the GENERATED OpenAPI types (never hand-mirror a generated type);
 * the local names are kept so consumers read naturally.
 */
export type SiteLinkGapBody = ApiSchemas["SiteLinkGapBody"];

/** One competitor the run WOULD compare against, with why it qualifies. */
export type SeededCompetitor = ApiSchemas["SeededCompetitor"];

/**
 * The answer to "what would this cost me and who would it look at?" — returned
 * by `/link-gap/seed`, which spends NOTHING. `can_run: false` carries a
 * plain-language `reason` written for the user (today: no competitor has been
 * confirmed yet), and the surface renders it as the next step, never an error.
 */
export type SiteLinkGapSeedResponse = ApiSchemas["SiteLinkGapSeedResponse"];

/**
 * Terminal receipt of the paid site-wide run (`seo.site_link_gap_completed`).
 * Streamed terminal events have no OpenAPI response schema, so this one shape
 * stays hand-typed against `matrx_seo.domain_link_gap.DomainLinkGapReceipt`.
 */
export interface DomainLinkGapReceipt {
  site_id: string;
  site_domain: string;
  seeded: SeededCompetitor[];
  excluded: string[];
  receipt: CollectionReceipt;
}

/** One prospect domain resolved into a CRM organization by the server fold. */
export type FoldedLinkGapDomain = ApiSchemas["FoldedDomain"];

/** A row the fold deliberately did NOT turn into a CRM record, and why. */
export type SkippedLinkGapDomain = ApiSchemas["SkippedRow"];

/**
 * What the CRM fold did. Only APPROVED prospects are folded; everything else
 * comes back in `skipped` with its current review state, so the backlog
 * waiting on a human decision is visible instead of silent. (The server calls
 * this `DomainFoldReport`; it is shared by every SEO→CRM fold.)
 */
export type LinkGapFoldReport = ApiSchemas["DomainFoldReport"];

/**
 * SERP/keyword prospecting (the second prospecting method): the shared body of
 * the no-spend `/serp-prospecting/preview` and the paid streamed run.
 */
export type SerpProspectingBody = ApiSchemas["SerpProspectingBody"];

/** Every query the run would send + the estimated cost, before any spend. */
export type SerpProspectingPreview = ApiSchemas["SerpProspectingPreview"];

/** One prospecting query with the variant + seed keyword that produced it. */
export type SerpProspectQuery = ApiSchemas["ProspectQuery"];

/**
 * Terminal receipt of the paid prospecting run
 * (`seo.serp_prospecting_completed`). Streamed — hand-typed against
 * `matrx_seo.serp_prospecting.SerpProspectingReceipt`.
 */
export interface SerpProspectingReceipt {
  site_id: string;
  site_domain: string;
  queries: SerpProspectQuery[];
  receipt: CollectionReceipt;
  enriched_domains: number;
  unmeasured_domains: number;
}

/**
 * Broken-link prospecting (the THIRD method): open the resource pages and
 * best-of lists SERP prospecting already found, and check every link they
 * point at. The prospect is the page's OWNER — the pitch is "the page you link
 * to no longer exists, here is a replacement", which is why this method
 * converts. It discovers nothing of its own and spends no provider money.
 */
export type BrokenLinkProspectingBody = ApiSchemas["BrokenLinkProspectingBody"];

/** How many candidate pages a pass would open, before it opens any. */
export type BrokenLinkProspectingPreview =
  ApiSchemas["BrokenLinkProspectingPreview"];

/**
 * Terminal report of a broken-link pass
 * (`seo.broken_link_prospecting_completed`). Streamed — hand-typed against
 * `aidream.services.seo.broken_link_prospecting.BrokenLinkProspectingReport`.
 *
 * 🚨 `dead_links` counts ONLY 404/410. `unverifiable_links` counts everything
 * we were not allowed to check (bot walls, paywalls, rate limits, timeouts) —
 * those are almost always healthy pages and must NEVER be shown as broken or
 * pitched, or the user emails a stranger a falsehood in their own name.
 */
export interface BrokenLinkProspectingReport {
  site_id: string;
  pages_checked: number;
  pages_failed: number;
  outbound_checked: number;
  dead_links: number;
  unverifiable_links: number;
  opportunities_updated: number;
  counts_healed: number;
  pages: BrokenLinkCheckedPage[];
  skipped: { page_url: string; domain: string; reason: string }[];
  errors: string[];
}

export interface BrokenLinkCheckedPage {
  serp_opportunity_id: string;
  serp_mention_id: string;
  domain: string;
  page_url: string;
  outbound_checked: number;
  dead: { dead_url: string; http_status: number; anchor_text: string | null }[];
  unverifiable: { url: string; http_status: number; why: string }[];
}

/**
 * List / CSV import (the FOURTH method): a list the user already has becomes
 * ordinary prospects in the same triage surface. The preview is a real dry-run
 * — every entry carries a verdict and a sentence BEFORE anything is written.
 */
export type ProspectImportBody = ApiSchemas["ProspectImportBody"];
export type ProspectImportPreview = ApiSchemas["ProspectImportPreview"];
export type ProspectImportEntry = ApiSchemas["ImportEntryPlan"];

/**
 * Terminal report of an import (`seo.prospect_import_completed`). Streamed —
 * hand-typed against `aidream.services.seo.prospect_import.ProspectImportReport`.
 */
export interface ProspectImportReport {
  site_id: string;
  created: number;
  matched: number;
  skipped: number;
  enriched: number;
  unmeasured: number;
  entries: ProspectImportEntry[];
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
