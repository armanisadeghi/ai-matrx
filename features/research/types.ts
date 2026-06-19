import type { components } from "@/types/python-generated/api-types";
import type { Database, Json } from "@/types/database.types";

// ============================================================================
// REQUEST BODY TYPES
// ============================================================================

export type TopicCreate = {
  name: string;
  description?: string | null;
  autonomy_level?: AutonomyLevel;
  template_id?: string | null;
};

export type TopicUpdate = {
  name?: string | null;
  description?: string | null;
  status?: TopicStatus | null;
  autonomy_level?: AutonomyLevel | null;
  default_search_provider?: SearchProvider | null;
  default_search_params?: Record<string, unknown> | null;
  good_scrape_threshold?: number | null;
  scrapes_per_keyword?: number | null;
  project_id?: string | null;
  // Quota ladder fields (migration 0013) — accepted by Supabase even though
  // database.types.ts hasn't been regenerated with them yet.
  max_keywords?: number | null;
  analyses_per_keyword?: number | null;
  max_keyword_syntheses?: number | null;
  max_project_syntheses?: number | null;
  max_documents?: number | null;
  max_tag_consolidations?: number | null;
  max_auto_tag_calls?: number | null;
  // Per-topic agent overrides — JSONB map of role_key → user agent UUID.
  // See features/research/admin/types.ts:AGENT_CONFIG_KEYS for valid keys.
  agent_config?: Record<string, string> | null;
  // Voice & Lens — free-text brand-voice/style profile injected into every
  // downstream generator so a topic's outputs share one voice (migration 0014).
  tone_profile?: string | null;
  // Output config — which downstream outputs are enabled + per-output overrides
  // (e.g. {podcast,blog,slides,seo} booleans + overrides). JSONB (migration 0014).
  outputs?: Record<string, unknown> | null;
};

export type KeywordCreate = components["schemas"]["KeywordCreate"];
export type SourceUpdate = components["schemas"]["SourceUpdate"];
export type SourceBulkAction = components["schemas"]["SourceBulkAction"];
export type SourceTagRequest = components["schemas"]["SourceTagRequest"];
export type ContentEditRequest = components["schemas"]["ContentEditRequest"];
export type ContentPasteRequest = components["schemas"]["ContentPasteRequest"];
export type ExtensionContentSubmit =
  components["schemas"]["ExtensionContentSubmit"];
export type ExtensionContentResponse =
  components["schemas"]["ExtensionContentResponse"];
export type ExtensionScrapeItem = components["schemas"]["ExtensionScrapeItem"];
export type ExtensionScrapeQueue =
  components["schemas"]["ExtensionScrapeQueue"];
export type VerdictRequest = components["schemas"]["VerdictRequest"];
export type VerdictResponse = components["schemas"]["VerdictResponse"];
/** The optional escape-hatch verdict the user can apply to any source. */
export type UserVerdict = VerdictRequest["verdict"];

/** Tier in the extension capture ladder. */
export type CaptureLevel = 1 | 2 | 3 | 4;
/** Capture levels the extension is permitted to submit (Level 4 paste flows through the regular paste route). */
export type ExtensionCaptureLevel = 1 | 2 | 3;
export type AnalyzeRequest = components["schemas"]["AnalyzeRequest"];
export type AnalyzeBulkRequest = components["schemas"]["AnalyzeBulkRequest"];
export type SynthesisRequest = components["schemas"]["SynthesisRequest"];
/**
 * Body for POST /research/topics/{id}/sources/rank-authority.
 * Hand-written; replace with components["schemas"]["AuthorityRankRequest"] on
 * the next OpenAPI type regen from Python.
 */
export interface AuthorityRankRequest {
  /** Specific sources to rank. Omit/null = every included source on the topic. */
  source_ids?: string[] | null;
  /** Re-rank sources that already have an authority score. */
  force?: boolean;
}
// topic_id was added on 2026-05-02; pending next type regen from Python
export type SuggestRequest = components["schemas"]["SuggestRequest"] & {
  topic_id?: string | null;
};

export type SuggestApplied = {
  type: "suggest_applied";
  topic_id: string;
  name_updated: boolean;
  description_updated: boolean;
  keywords_saved: string[];
  keywords_skipped_duplicate: string[];
  keywords_dropped_by_quota: string[];
  max_keywords: number;
};
export type TagCreate = components["schemas"]["TagCreate"];
export type TagUpdate = components["schemas"]["TagUpdate"];
export type TemplateCreate = components["schemas"]["TemplateCreate"];
export type AddLinksToScope = components["schemas"]["AddLinksToScope"];
export type MediaUpdate = components["schemas"]["MediaUpdate"];
export type RunPipelineRequest = components["schemas"]["RunPipelineRequest"];

// ============================================================================
// ENUM TYPES
// ============================================================================

export type AutonomyLevel = "auto" | "semi" | "manual";
export type SearchProvider = "brave" | "google";
export type ScrapeStatus =
  | "pending"
  | "success"
  | "thin"
  | "failed"
  | "manual"
  | "skipped"
  | "complete"
  | "dead_link"
  | "gated"
  // Honest user-driven terminal verdicts (2026-06-18, from matrx-extend).
  | "ignored"
  | "content_mismatch";
export type SourceType = "web" | "youtube" | "pdf" | "file" | "manual";
export type SourceOrigin =
  | "search"
  | "manual"
  | "link_extraction"
  | "file_upload";
export type SynthesisScope = "keyword" | "project";
export type IterationMode = "initial" | "rebuild" | "update";
export type BulkAction =
  | "include"
  | "exclude"
  | "mark_stale"
  | "mark_complete"
  | "scrape";
export type MediaType = "image" | "video" | "document";
export type TagAssignedBy = "manual" | "auto" | "llm_suggestion";
export type TopicStatus =
  | "draft"
  | "searching"
  | "scraping"
  | "curating"
  | "analyzing"
  | "complete";

// ============================================================================
// RESPONSE TYPES (matching database tables)
// ============================================================================

/** Database row — canonical shape for `rs_topic` */
export type ResearchTopicRow = Database["public"]["Tables"]["rs_topic"]["Row"];

/**
 * Quota ladder fields added in migration 0013_rs_topic_quota_ladder.sql.
 * The Supabase generated types are stale; we layer these on at the type level
 * until `database.types.ts` is regenerated. Values are guaranteed present on
 * `rs_topic` rows since the migration backfilled defaults.
 */
export interface TopicQuotaFields {
  max_keywords: number;
  scrapes_per_keyword: number;
  analyses_per_keyword: number;
  max_keyword_syntheses: number;
  max_project_syntheses: number;
  max_documents: number;
  max_tag_consolidations: number;
  max_auto_tag_calls: number;
}

/** Per-phase cost line item — mirrors backend `CostBreakdownItem`. */
export interface CostBreakdownItem {
  label: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
}

/** Cost summary returned on `GET /research/topics/{id}` per QUOTA_LADDER.md. */
export interface TopicCostSummary {
  total_llm_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_estimated_cost_usd: number;
  page_analyses: CostBreakdownItem;
  keyword_syntheses: CostBreakdownItem;
  project_syntheses: CostBreakdownItem;
  tag_consolidations: CostBreakdownItem;
  document_assembly: CostBreakdownItem;
}

/**
 * Canonical topic shape used throughout the UI.
 * Combines the Supabase row with quota ladder fields. Topics on the wire
 * come from Supabase (`rs_topic`), which does NOT carry the computed
 * `cost_summary` — that lives only on the Python `TopicResponse` and
 * must be fetched via `useCostSummary(topicId)` separately.
 *
 * `autonomy_level` is narrowed from the loose Supabase `string` to the
 * three documented values per FRONTEND_SPEC §2 — Supabase column
 * regeneration would do this automatically; for now we narrow at the
 * application boundary.
 */
export type ResearchTopic = Omit<ResearchTopicRow, "autonomy_level"> &
  TopicQuotaFields & {
    autonomy_level: "auto" | "semi" | "manual";
  };

export type LlmStatus = "success" | "failed";

export interface ResearchProgress {
  total_keywords: number;
  stale_keywords: number;
  total_sources: number;
  included_sources: number;
  sources_by_status: Record<ScrapeStatus, number>;
  total_content: number;
  total_analyses: number;
  total_eligible_for_analysis: number;
  failed_analyses: number;
  keyword_syntheses: number;
  failed_keyword_syntheses: number;
  project_syntheses: number;
  failed_project_syntheses: number;
  total_tags: number;
  total_documents: number;
}

export interface TopicWithProgress {
  topic: ResearchTopic;
  progress: ResearchProgress;
}

export interface ResearchKeyword {
  id: string;
  topic_id: string;
  keyword: string;
  /**
   * 1-indexed priority order within a topic. Position 1 = highest priority.
   * The server MUST search/scrape keywords in ascending position order, and
   * apply per-topic max-keywords limits by holding back the highest positions
   * (e.g. limit=3 with 5 keywords processes 1,2,3 and holds 4,5).
   */
  position: number;
  search_provider: string;
  search_params: Json;
  last_searched_at: string | null;
  is_stale: boolean | null;
  result_count: number | null;
  raw_api_response: Json | null;
  created_at: string | null;
}

export interface ResearchSource {
  id: string;
  topic_id: string;
  url: string;
  title: string | null;
  description: string | null;
  hostname: string | null;
  source_type: string;
  origin: string;
  rank: number | null;
  page_age: string | null;
  thumbnail_url: string | null;
  extra_snippets: Json | null;
  raw_search_result: Json | null;
  is_included: boolean | null;
  is_stale: boolean | null;
  scrape_status: string;
  discovered_at: string | null;
  last_seen_at: string | null;
  /** AI-assessed authoritativeness 0-100 (Source Authority Ranker). null = not yet ranked. */
  authority_score: number | null;
  /** AI-assessed authority tier: 'high' | 'medium' | 'low'. null = not yet ranked.
   *  Typed `string` to match the generated DB row (a CHECK constraint, not an enum);
   *  AuthorityTierBadge narrows + validates it. */
  authority_tier: string | null;
  /** One-sentence justification for the score/tier. */
  authority_reasoning: string | null;
  /** When the authority fields were last set. null = not yet ranked. */
  authority_ranked_at: string | null;
}

export interface ResearchContent {
  id: string;
  source_id: string;
  topic_id: string;
  content: string | null;
  /** Original scraped content, backed up once on the first user edit (recoverable). */
  original_content: string | null;
  content_hash: string | null;
  char_count: number | null;
  content_type: string | null;
  is_good_scrape: boolean | null;
  quality_override: string | null;
  capture_method: string | null;
  failure_reason: string | null;
  published_at: string | null;
  modified_at: string | null;
  is_current: boolean | null;
  version: number | null;
  linked_extraction_id: string | null;
  linked_transcript_id: string | null;
  extracted_links: Json | null;
  extracted_images: Json | null;
  scraped_at: string | null;
}

export interface ResearchAnalysis {
  id: string;
  content_id: string;
  source_id: string;
  topic_id: string;
  agent_type: string;
  agent_id: string | null;
  model_id: string | null;
  instructions: string | null;
  status: string;
  result: string | null;
  error: string | null;
  result_structured: Json | null;
  token_usage: Json | null;
  created_at: string | null;
}

export interface ResearchSynthesis {
  id: string;
  topic_id: string;
  keyword_id: string | null;
  tag_id: string | null;
  scope: string;
  agent_type: string;
  agent_id: string | null;
  model_id: string | null;
  instructions: string | null;
  status: string;
  result: string | null;
  error: string | null;
  result_structured: Json | null;
  input_source_ids: Json | null;
  input_analysis_ids: Json | null;
  token_usage: Json | null;
  is_current: boolean | null;
  version: number | null;
  iteration_mode: string | null;
  previous_synthesis_id: string | null;
  created_at: string | null;
}

export interface ResearchTag {
  id: string;
  topic_id: string;
  name: string;
  description: string | null;
  sort_order: number | null;
  created_at: string | null;
  source_count?: number;
}

export interface SourceTag {
  id: string;
  source_id: string;
  tag_id: string;
  is_primary_source: boolean | null;
  confidence: number | null;
  assigned_by: string | null;
  created_at: string | null;
}

export interface TagConsolidation {
  id: string;
  tag_id: string;
  topic_id: string;
  agent_type: string;
  agent_id: string | null;
  model_id: string | null;
  status: LlmStatus;
  result: string | null;
  error: string | null;
  result_structured: Record<string, unknown> | null;
  source_content_ids: string[];
  token_usage: TokenUsage | null;
  is_current: boolean;
  version: number;
  created_at: string;
}

export interface ResearchDocument {
  id: string;
  topic_id: string;
  title: string | null;
  status: string;
  content: string | null;
  error: string | null;
  content_structured: Json | null;
  source_consolidation_ids: Json | null;
  agent_type: string | null;
  agent_id: string | null;
  model_id: string | null;
  token_usage: Json | null;
  version: number | null;
  created_at: string | null;
  is_current: boolean;
}

export interface ResearchTemplate {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_by: string | null;
  keyword_templates: Json | null;
  default_tags: Json | null;
  default_search_params: Json | null;
  agent_config: Json | null;
  autonomy_level: string;
  metadata: Json | null;
  created_at: string;
}

export interface ResearchMedia {
  id: string;
  source_id: string;
  topic_id: string;
  media_type: string;
  url: string;
  alt_text: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  width: number | null;
  height: number | null;
  is_relevant: boolean | null;
  metadata: Json | null;
  created_at: string | null;
}

export interface ExtractedLink {
  url: string;
  link_text: string | null;
  found_on_source_id: string;
  found_on_title: string | null;
  found_on_url: string | null;
}

export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  model?: string;
  estimated_cost?: number;
}

/** Narrow DB `Json` (unknown) token_usage payloads for UI. */
export function tokenUsageFromJson(
  raw: Json | null | undefined,
): TokenUsage | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const out: TokenUsage = {};
  if (typeof o.input_tokens === "number") out.input_tokens = o.input_tokens;
  if (typeof o.output_tokens === "number") out.output_tokens = o.output_tokens;
  if (typeof o.total_tokens === "number") out.total_tokens = o.total_tokens;
  if (typeof o.model === "string") out.model = o.model;
  if (typeof o.estimated_cost === "number")
    out.estimated_cost = o.estimated_cost;
  return Object.keys(out).length > 0 ? out : null;
}

/** `rs_template.keyword_templates` — expect string[] in JSONB. */
export function keywordTemplatesFromJson(
  raw: Json | null | undefined,
): string[] {
  if (raw == null || !Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string");
}

/** `extra_snippets` JSONB — string snippets for display. */
export function stringArrayFromJson(raw: Json | null | undefined): string[] {
  return keywordTemplatesFromJson(raw);
}

/** True length for JSONB columns stored as arrays (e.g. extracted_links). */
export function jsonArrayLength(raw: Json | null | undefined): number {
  return Array.isArray(raw) ? raw.length : 0;
}

const AUTONOMY_LEVELS = new Set<string>(["auto", "semi", "manual"]);
const SEARCH_PROVIDERS = new Set<string>(["brave", "google"]);
const TOPIC_STATUSES = new Set<string>([
  "draft",
  "searching",
  "scraping",
  "curating",
  "analyzing",
  "complete",
]);

export function autonomyLevelFromDb(value: string): AutonomyLevel {
  return AUTONOMY_LEVELS.has(value) ? (value as AutonomyLevel) : "manual";
}

export function searchProviderFromDb(value: string): SearchProvider {
  return SEARCH_PROVIDERS.has(value) ? (value as SearchProvider) : "brave";
}

export function topicStatusFromDb(value: string): TopicStatus {
  return TOPIC_STATUSES.has(value) ? (value as TopicStatus) : "draft";
}

const SOURCE_TYPES_SET = new Set<string>([
  "web",
  "youtube",
  "pdf",
  "file",
  "manual",
]);
const SOURCE_ORIGINS_SET = new Set<string>([
  "search",
  "manual",
  "link_extraction",
  "file_upload",
]);

export function sourceTypeFromDb(value: string): SourceType {
  return SOURCE_TYPES_SET.has(value) ? (value as SourceType) : "web";
}

export function sourceOriginFromDb(value: string): SourceOrigin {
  return SOURCE_ORIGINS_SET.has(value) ? (value as SourceOrigin) : "search";
}

export interface SuggestResponse {
  title: string;
  description: string;
  keywords: string[];
  initial_insights: string | null;
}

export interface TagSuggestion {
  tag_name: string;
  confidence: number;
  reason: string;
}

// ============================================================================
// STREAMING TYPES
// ============================================================================

export type ResearchStreamStep =
  | "searching"
  | "scraping"
  | "analyzing"
  | "synthesizing"
  | "retrying"
  | "reporting"
  | "complete"
  | "error";

export interface ResearchStreamStatus {
  status: ResearchStreamStep;
  user_message: string;
  current_step?: number;
  total_steps?: number;
}

// ── Research Data Events ─────────────────────────────────────────────────────
// When top-level `event === "data"`, the `data` object is a research event.
// The `data.type` field discriminates the specific research event type
// (matches the Pydantic `Literal["..."]` discriminator on each backend model).
// Source: research/stream_events.py (Python backend Pydantic models)

export interface SearchPageStart {
  type: "search_page_start";
  keyword: string;
  keyword_id: string;
  page: number;
  total_pages: number;
}

export interface SearchPageComplete {
  type: "search_page_complete";
  keyword: string;
  keyword_id: string;
  page: number;
  page_count: number;
  total_so_far: number;
}

export interface SearchSourcesStored {
  type: "search_sources_stored";
  keyword_id: string;
  stored_count: number;
}

export interface SearchComplete {
  type: "search_complete";
  total_sources: number;
}

export interface ScrapeStart {
  type: "scrape_start";
  source_id: string;
  url: string;
}

export interface ScrapeComplete {
  type: "scrape_complete";
  source_id: string;
  url: string;
  status: "success" | "thin" | "failed";
  char_count: number;
  is_good_scrape: boolean;
}

export interface ScrapeFailed {
  type: "scrape_failed";
  source_id: string;
  url: string;
  reason: string;
}

export interface RescrapeComplete {
  type: "rescrape_complete";
  source_id: string;
  is_good_scrape: boolean;
  char_count: number;
}

export interface AnalysisStart {
  type: "analysis_start";
  source_id: string;
  total: number;
}

export interface AnalysisComplete {
  type: "analysis_complete";
  source_id: string;
  agent_type: string;
  model_id: string | null;
  result_length: number;
}

export interface AnalysisFailed {
  type: "analysis_failed";
  source_id: string;
  error: string;
}

export interface AnalyzeAllComplete {
  type: "analyze_all_complete";
  count: number;
}

export interface RetryComplete {
  type: "retry_complete";
  analysis_id: string;
  result: Record<string, unknown>;
}

export interface RetryAllComplete {
  type: "retry_all_complete";
  retried: number;
  succeeded: number;
}

export interface SynthesisStart {
  type: "synthesis_start";
  scope: "keyword" | "project";
  keyword_id?: string | null;
  keyword?: string | null;
}

export interface SynthesisComplete {
  type: "synthesis_complete";
  scope: "keyword" | "project";
  keyword_id?: string | null;
  keyword?: string | null;
  result_length: number;
  model_id: string | null;
  version: number;
}

export interface SynthesisFailed {
  type: "synthesis_failed";
  scope: "keyword" | "project";
  keyword_id?: string | null;
  error: string;
}

export interface AuthorityRankStart {
  type: "authority_rank_start";
  total: number;
  batches: number;
}

export interface AuthorityRankBatch {
  type: "authority_rank_batch";
  batch_index: number;
  batch_count: number;
  ranked: number;
}

export interface AuthorityRankComplete {
  type: "authority_rank_complete";
  ranked: number;
  total: number;
  batches: number;
  failed: number;
}

export interface SuggestSetupComplete {
  type: "suggest_complete";
  title: string;
  description: string;
  suggested_keywords: string[];
  initial_insights?: string | null;
}

export interface ConsolidateComplete {
  type: "consolidate_complete";
  tag_id: string;
  result: Record<string, unknown>;
}

export interface SuggestTagsComplete {
  type: "suggest_tags_complete";
  source_id: string;
  result: Record<string, unknown>;
}

export interface DocumentComplete {
  type: "document_complete";
  result: Record<string, unknown>;
}

export interface PipelineComplete {
  type: "pipeline_complete";
  topic_id: string;
}

/**
 * Discriminated union of all research domain events.
 * Arrives when top-level `event === "data"` — discriminated by `data.type`.
 * Typed from research/stream_events.py (backend Pydantic models).
 */
export type ResearchDataEvent =
  | SearchPageStart
  | SearchPageComplete
  | SearchSourcesStored
  | SearchComplete
  | ScrapeStart
  | ScrapeComplete
  | ScrapeFailed
  | RescrapeComplete
  | AnalysisStart
  | AnalysisComplete
  | AnalysisFailed
  | AnalyzeAllComplete
  | RetryComplete
  | RetryAllComplete
  | SynthesisStart
  | SynthesisComplete
  | SynthesisFailed
  | AuthorityRankStart
  | AuthorityRankBatch
  | AuthorityRankComplete
  | SuggestSetupComplete
  | ConsolidateComplete
  | SuggestTagsComplete
  | DocumentComplete
  | PipelineComplete;

/** @deprecated Use ResearchDataEvent instead — matches real backend contract */
export type ResearchStreamDataPayload = ResearchDataEvent;

/**
 * Backend `info` event payload — per FRONTEND_SPEC §18 and QUOTA_LADDER §"Quota-exceeded errors".
 *
 * Codes we expect:
 * - `search_results_found` — fired after each keyword search completes.
 * - `quota_exceeded` — fired when a phase hits a quota cap; stream continues, does NOT crash.
 * - Future codes are passed through verbatim; UI handles unknown codes generically.
 */
export interface ResearchInfoEvent {
  code: string;
  message: string;
  user_message?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ResearchStreamCallbacks {
  onChunk?: (text: string) => void;
  onStatusUpdate?: (
    step: ResearchStreamStep,
    message: string,
    metadata?: Record<string, unknown>,
  ) => void;
  /** Typed research data event — discriminate on `payload.type` */
  onData?: (payload: ResearchDataEvent) => void;
  /** First-class `info` event — used for quota_exceeded and search_results_found. */
  onInfo?: (info: ResearchInfoEvent) => void;
  onCompletion?: (payload: Record<string, unknown>) => void;
  onToolEvent?: (event: Record<string, unknown>) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
  onUnknownEvent?: (event: { event: string; data: unknown }) => void;
}

// ============================================================================
// SOURCE FILTER TYPES
// ============================================================================

export type SourceSortBy =
  | "rank"
  | "page_age"
  | "discovered_at"
  | "hostname"
  | "scrape_status"
  | "authority_score";
export type SortDir = "asc" | "desc";

export interface SourceFilters {
  keyword_id?: string;
  scrape_status?: ScrapeStatus;
  source_type?: SourceType;
  hostname?: string;
  is_included?: boolean;
  origin?: SourceOrigin;
  sort_by?: SourceSortBy;
  sort_dir?: SortDir;
  limit: number;
  offset: number;
}

export const DEFAULT_SOURCE_FILTERS: SourceFilters = {
  limit: 50,
  offset: 0,
};

// ============================================================================
// BACKWARD COMPATIBILITY ALIASES
// ============================================================================

/** @deprecated Use ResearchTopic instead */
export type ResearchConfig = ResearchTopic;
/** @deprecated Use TopicWithProgress instead */
export type ResearchState = TopicWithProgress;
