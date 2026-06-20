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
/**
 * Body for POST /research/topics/{id}/auto-tag.
 * Hand-written; replace with components["schemas"]["AutoTagPassRequest"] on the
 * next OpenAPI type regen from Python.
 */
export interface AutoTagPassRequest {
  /** Cap the sources tagged this run. Omit = topic setting, else every eligible source. */
  max_calls?: number | null;
}
/**
 * Body for POST /research/topics/{id}/auto-consolidate.
 * Hand-written; replace with components["schemas"]["AutoConsolidatePassRequest"]
 * on the next OpenAPI type regen from Python.
 */
export interface AutoConsolidatePassRequest {
  /** Cap the tags consolidated this run. Omit = topic setting, else every populated tag. */
  max_calls?: number | null;
}
/**
 * Body for POST /research/topics/{id}/generate-tag-suggestions (streaming).
 * Hand-written; replace with components["schemas"]["GenerateTagsRequest"] on the
 * next OpenAPI type regen from Python.
 */
export interface GenerateTagsRequest {
  /** Optional free-text guidance that steers which cross-cutting dimensions the model proposes. */
  user_input?: string | null;
}
/**
 * Body for POST /research/topics/{id}/apply-tag-suggestions.
 * Hand-written; replace with components["schemas"]["ApplyTagsRequest"] on the
 * next OpenAPI type regen from Python.
 */
export interface ApplyTagsRequest {
  /** The `name` of each suggested dimension the user chose to create as a real tag. */
  picked_names: string[];
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
 *
 * `tag_suggestions` is narrowed from the loose Supabase `Json` to the typed
 * `TagSuggestionsBundle` (or null) at the same boundary.
 */
export type ResearchTopic = Omit<
  ResearchTopicRow,
  "autonomy_level" | "tag_suggestions"
> &
  TopicQuotaFields & {
    autonomy_level: "auto" | "semi" | "manual";
    tag_suggestions: TagSuggestionsBundle | null;
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
  /**
   * The full deep per-page analysis written by the read-the-page agent. null
   * until the page has actually been read + analyzed. Narrow with
   * `pageAnalysisFromJson` before reading any field. See `PageAnalysis`.
   */
  page_analysis: PageAnalysis | null;
  /** Post-read 0-100 page value (the agent's read-the-page verdict). null = not analyzed. */
  post_read_score: number | null;
  /** Final fused source score (pre-read + post-read + authority). null = not analyzed. */
  final_source_score: number | null;
  /** The agent's verdict on how to use this source — see `RecommendedUse`. */
  recommended_use: string | null;
  /** Outcome of the page analysis pass — see `AnalysisStatus`. */
  analysis_status: string | null;
  /** Pre-read 0-100 score (from the search snippet, before the page was read). */
  pre_read_score: number | null;
  /** Structured breakdown behind `pre_read_score` (raw JSONB). */
  pre_read_breakdown: Json | null;
}

// ============================================================================
// PAGE ANALYSIS — the deep, structured per-page read written by the
// read-the-page agent and persisted to `rs_source.page_analysis` (JSONB).
// Mirrors the backend Pydantic `PageAnalysis` shape exactly. Every field is
// rendered in the source detail "Page analysis" document; NOTHING is dropped.
// ============================================================================

/** The agent's terminal classification of the page it read. */
export type AnalysisStatus =
  | "valid"
  | "invalid"
  | "inaccessible"
  | "irrelevant"
  | "thin"
  | "ad_heavy"
  | "duplicate"
  | "error";

/** The agent's recommendation for how this source should be used downstream. */
export type RecommendedUse =
  | "cite_directly"
  | "use_as_background"
  | "use_for_leads_only"
  | "compare_against_other_sources"
  | "reject";

/** One short verbatim quote pulled from the page, with who said it. */
export interface PageQuote {
  quote: string;
  speaker: string | null;
}

/** A discrete finding the agent extracted, with its provenance + weighting. */
export interface PageFinding {
  finding: string;
  supporting_text: string | null;
  /** 0-100 confidence. Render as an integer percentage. */
  confidence: number | null;
  /** Free-text importance label (e.g. "high" | "medium" | "low"). */
  importance: string | null;
  /** Free-text kind of finding (e.g. "statistic", "claim", "definition"). */
  finding_type: string | null;
}

/** A notable claim the agent surfaced, with its assessment of support. */
export interface PageClaim {
  claim: string;
  /** Whether the page itself backs the claim with evidence. */
  is_well_supported: boolean | null;
  /** The agent's prose assessment of how well-supported the claim is. */
  support_assessment: string | null;
}

/** Boolean evidence signals the agent detected on the page. */
export interface EvidenceSignals {
  has_primary_data: boolean;
  has_citations: boolean;
  has_methodology: boolean;
  has_expert_attribution: boolean;
  has_specific_numbers: boolean;
  has_dates: boolean;
  has_named_sources: boolean;
  has_original_reporting: boolean;
  has_verifiable_claims: boolean;
}

/** Boolean bias / risk signals the agent detected (true = a caution). */
export interface BiasAndRiskSignals {
  is_promotional: boolean;
  is_opinion_heavy: boolean;
  has_undisclosed_conflicts: boolean;
  has_sensational_language: boolean;
  has_unsupported_claims: boolean;
  is_outdated: boolean;
}

/** Dates the agent could read off the page. */
export interface PageDates {
  published_date: string | null;
  updated_date: string | null;
  content_timeframe: string | null;
}

/** Named entities grouped by category — each a flat string list. */
export interface EntitiesMentioned {
  people: string[];
  organizations: string[];
  products: string[];
  studies: string[];
  locations: string[];
}

/**
 * The full deep analysis of a single page. Persisted on
 * `rs_source.page_analysis`. Read it through `pageAnalysisFromJson`, which
 * defensively narrows the loose JSONB and supplies safe empties — so the UI
 * can render every section without per-field guards.
 */
export interface PageAnalysis {
  analysis_status: AnalysisStatus | null;
  should_use: boolean | null;
  should_reject: boolean | null;
  rejection_reason: string | null;
  page_type: string | null;
  // Eight 0-100 axes. commercial_bias_score is INVERTED (higher = worse).
  topic_relevance_score: number | null;
  content_quality_score: number | null;
  evidence_quality_score: number | null;
  authority_after_read_score: number | null;
  freshness_score: number | null;
  originality_score: number | null;
  specificity_score: number | null;
  commercial_bias_score: number | null;
  overall_page_value_score: number | null;
  summary_markdown: string | null;
  key_facts: string[];
  notable_quotes: PageQuote[];
  core_findings: PageFinding[];
  notable_claims: PageClaim[];
  evidence_signals: EvidenceSignals | null;
  bias_and_risk_signals: BiasAndRiskSignals | null;
  dates: PageDates | null;
  entities_mentioned: EntitiesMentioned | null;
  recommended_use: RecommendedUse | null;
  analysis_notes: string | null;
}

const ANALYSIS_STATUSES = new Set<AnalysisStatus>([
  "valid",
  "invalid",
  "inaccessible",
  "irrelevant",
  "thin",
  "ad_heavy",
  "duplicate",
  "error",
]);
const RECOMMENDED_USES = new Set<RecommendedUse>([
  "cite_directly",
  "use_as_background",
  "use_for_leads_only",
  "compare_against_other_sources",
  "reject",
]);

function asObject(raw: unknown): Record<string, unknown> | null {
  return raw != null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}
function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function asBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}

/**
 * Defensively narrow the loose Supabase `Json` from `rs_source.page_analysis`
 * into the typed `PageAnalysis`, dropping anything malformed and supplying safe
 * empties (empty arrays, null scalars) so every consumer can render the whole
 * document without per-field guards. Returns null only when the column itself
 * is absent — i.e. the page was never analyzed (an honest empty state).
 */
export function pageAnalysisFromJson(
  raw: Json | null | undefined,
): PageAnalysis | null {
  const o = asObject(raw);
  if (!o) return null;

  const statusRaw = asString(o.analysis_status);
  const status =
    statusRaw && ANALYSIS_STATUSES.has(statusRaw as AnalysisStatus)
      ? (statusRaw as AnalysisStatus)
      : null;
  const useRaw = asString(o.recommended_use);
  const recommendedUse =
    useRaw && RECOMMENDED_USES.has(useRaw as RecommendedUse)
      ? (useRaw as RecommendedUse)
      : null;

  const quotes: PageQuote[] = Array.isArray(o.notable_quotes)
    ? o.notable_quotes
        .map(asObject)
        .filter((q): q is Record<string, unknown> => q != null)
        .map((q) => ({
          quote: asString(q.quote) ?? "",
          speaker: asString(q.speaker),
        }))
        .filter((q) => q.quote.length > 0)
    : [];

  const findings: PageFinding[] = Array.isArray(o.core_findings)
    ? o.core_findings
        .map(asObject)
        .filter((f): f is Record<string, unknown> => f != null)
        .map((f) => ({
          finding: asString(f.finding) ?? "",
          supporting_text: asString(f.supporting_text),
          confidence: asNumber(f.confidence),
          importance: asString(f.importance),
          finding_type: asString(f.finding_type),
        }))
        .filter((f) => f.finding.length > 0)
    : [];

  const claims: PageClaim[] = Array.isArray(o.notable_claims)
    ? o.notable_claims
        .map(asObject)
        .filter((c): c is Record<string, unknown> => c != null)
        .map((c) => ({
          claim: asString(c.claim) ?? "",
          is_well_supported: asBool(c.is_well_supported),
          support_assessment: asString(c.support_assessment),
        }))
        .filter((c) => c.claim.length > 0)
    : [];

  const ev = asObject(o.evidence_signals);
  const evidence_signals: EvidenceSignals | null = ev
    ? {
        has_primary_data: ev.has_primary_data === true,
        has_citations: ev.has_citations === true,
        has_methodology: ev.has_methodology === true,
        has_expert_attribution: ev.has_expert_attribution === true,
        has_specific_numbers: ev.has_specific_numbers === true,
        has_dates: ev.has_dates === true,
        has_named_sources: ev.has_named_sources === true,
        has_original_reporting: ev.has_original_reporting === true,
        has_verifiable_claims: ev.has_verifiable_claims === true,
      }
    : null;

  const br = asObject(o.bias_and_risk_signals);
  const bias_and_risk_signals: BiasAndRiskSignals | null = br
    ? {
        is_promotional: br.is_promotional === true,
        is_opinion_heavy: br.is_opinion_heavy === true,
        has_undisclosed_conflicts: br.has_undisclosed_conflicts === true,
        has_sensational_language: br.has_sensational_language === true,
        has_unsupported_claims: br.has_unsupported_claims === true,
        is_outdated: br.is_outdated === true,
      }
    : null;

  const d = asObject(o.dates);
  const dates: PageDates | null = d
    ? {
        published_date: asString(d.published_date),
        updated_date: asString(d.updated_date),
        content_timeframe: asString(d.content_timeframe),
      }
    : null;

  const en = asObject(o.entities_mentioned);
  const entities_mentioned: EntitiesMentioned | null = en
    ? {
        people: asStringArray(en.people),
        organizations: asStringArray(en.organizations),
        products: asStringArray(en.products),
        studies: asStringArray(en.studies),
        locations: asStringArray(en.locations),
      }
    : null;

  return {
    analysis_status: status,
    should_use: asBool(o.should_use),
    should_reject: asBool(o.should_reject),
    rejection_reason: asString(o.rejection_reason),
    page_type: asString(o.page_type),
    topic_relevance_score: asNumber(o.topic_relevance_score),
    content_quality_score: asNumber(o.content_quality_score),
    evidence_quality_score: asNumber(o.evidence_quality_score),
    authority_after_read_score: asNumber(o.authority_after_read_score),
    freshness_score: asNumber(o.freshness_score),
    originality_score: asNumber(o.originality_score),
    specificity_score: asNumber(o.specificity_score),
    commercial_bias_score: asNumber(o.commercial_bias_score),
    overall_page_value_score: asNumber(o.overall_page_value_score),
    summary_markdown: asString(o.summary_markdown),
    key_facts: asStringArray(o.key_facts),
    notable_quotes: quotes,
    core_findings: findings,
    notable_claims: claims,
    evidence_signals,
    bias_and_risk_signals,
    dates,
    entities_mentioned,
    recommended_use: recommendedUse,
    analysis_notes: asString(o.analysis_notes),
  };
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

// ── Cross-cutting tag suggestions ────────────────────────────────────────────
// A "cross-cutting" dimension is a tag the model proposes after looking across
// the topic's keywords + search results — one theme that spans several keywords
// rather than belonging to a single one. The user GENERATES these, PICKS which
// to keep, and CREATES them as real `rs_tag` rows. Persisted on
// `rs_topic.tag_suggestions`; mirrors the backend bundle shape.

/** One proposed cross-cutting dimension. */
export interface CrossCuttingTagSuggestion {
  /** The dimension name — becomes the `rs_tag.name` when created. */
  name: string;
  /** The topic keywords this dimension cuts across. */
  keywords_spanned: string[];
  /** Model confidence, 0–1. Render as an integer percentage (never a decimal). */
  confidence: number;
  /** One-line rationale for why this is a useful cross-cutting tag. */
  reason: string;
  /** True once a real `rs_tag` has been created from this suggestion. */
  applied: boolean;
}

/** The full `rs_topic.tag_suggestions` payload — a generation run + its results. */
export interface TagSuggestionsBundle {
  /** ISO timestamp of the generation run. */
  generated_at: string;
  /** The optional user guidance that steered this run, if any. */
  user_input?: string | null;
  tags: CrossCuttingTagSuggestion[];
}

/** Response from POST /research/topics/{id}/apply-tag-suggestions. */
export interface ApplyTagsResponse {
  /** Number of new `rs_tag` rows created this call. */
  created: number;
  /** Number of source→tag assignments written. */
  assignments: number;
}

/** Response from GET /research/topics/{id}/tag-input-export. */
export interface TagInputExportResponse {
  /** The keyword list, formatted exactly as the agent receives it. */
  keywords_text: string;
  /** The search-results blob, formatted exactly as the agent receives it. */
  search_results_text: string;
}

/**
 * Narrow the loose Supabase `Json` from `rs_topic.tag_suggestions` into the
 * typed bundle, dropping anything malformed. Returns null when absent/invalid.
 * Lets components read `topic.tag_suggestions` safely regardless of store typing.
 */
export function tagSuggestionsFromJson(
  raw: Json | null | undefined,
): TagSuggestionsBundle | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.tags)) return null;
  const tags: CrossCuttingTagSuggestion[] = o.tags
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
    .map((t) => ({
      name: typeof t.name === "string" ? t.name : "",
      keywords_spanned: Array.isArray(t.keywords_spanned)
        ? t.keywords_spanned.filter(
            (k): k is string => typeof k === "string",
          )
        : [],
      confidence: typeof t.confidence === "number" ? t.confidence : 0,
      reason: typeof t.reason === "string" ? t.reason : "",
      applied: t.applied === true,
    }))
    .filter((t) => t.name.length > 0);
  return {
    generated_at:
      typeof o.generated_at === "string" ? o.generated_at : "",
    user_input: typeof o.user_input === "string" ? o.user_input : null,
    tags,
  };
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

export interface TagSuggestionsStart {
  type: "tag_suggestions_start";
}

export interface TagSuggestionsComplete {
  type: "tag_suggestions_complete";
  tags: CrossCuttingTagSuggestion[];
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
  | TagSuggestionsStart
  | TagSuggestionsComplete
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
  | "authority_score"
  | "final_source_score";
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
