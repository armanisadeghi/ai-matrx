/**
 * Shared human/agent copy builders for the research pipeline surfaces.
 *
 * ONE place builds every research Copy / Copy-for-AI flavor, so a row, its
 * list, and the page-level Groomer never re-derive the same summary (the
 * `agent-copy` skill's "never duplicate the summary across files" rule).
 * `format.ts` next door stays what it is — the compact number formatter.
 *
 * THE WHAT-I-SEE LAW: the research pages lead with a metric strip — the
 * `LastRunSummary` receipt and the `ResultsHeroMetrics` stat-square rail.
 * Nothing on these pages is interpretable without those numbers, so
 * {@link researchKpis} is mirrored verbatim into the envelope of EVERY payload
 * built here — row, list, section, and page alike. The agent must never have to
 * recompute what the user is already looking at.
 */

import { humanLines } from "@/features/marketing/lib/copy-payloads";
import type {
  ResearchAnalysis,
  ResearchKeyword,
  ResearchProgress,
  ResearchSource,
  ResearchSynthesis,
  TopicCostSummary,
} from "@/features/research/types";

/** Location line for every research payload. */
export function researchLocation(surface: string): string {
  return `AI Matrx — Research — ${surface}`;
}

// ── The page KPIs every payload carries ───────────────────────────────────

/**
 * The numbers the topic pages LEAD with, in one object.
 *
 * Mirrors `LastRunSummary`'s receipt lines and the `buildHeroMetrics` rail
 * exactly — including the same "characters processed" derivation (tokens × 4)
 * the rail displays, so a payload never disagrees with the tile the user is
 * looking at.
 */
export function researchKpis(
  progress: ResearchProgress | null | undefined,
  costSummary: TopicCostSummary | null | undefined,
) {
  // Cost-derived numbers are NULL, never 0, when no cost summary is in scope.
  // A surface that does not load costs must not assert "$0 spent" — that is a
  // fabricated KPI, and the agent would read it as fact.
  const hasCost = costSummary != null;
  const inputTokens = costSummary?.total_input_tokens ?? 0;
  const outputTokens = costSummary?.total_output_tokens ?? 0;
  return {
    keywords: progress?.total_keywords ?? 0,
    sources_total: progress?.total_sources ?? 0,
    sources_included: progress?.included_sources ?? 0,
    pages_read: progress?.total_content ?? 0,
    analyses: progress?.total_analyses ?? 0,
    analyses_eligible: progress?.total_eligible_for_analysis ?? 0,
    keyword_syntheses: progress?.keyword_syntheses ?? 0,
    topic_syntheses: progress?.topic_syntheses ?? 0,
    documents: progress?.total_documents ?? 0,
    // Same proxy the hero rail renders (~4 chars / token).
    characters_processed: hasCost ? (inputTokens + outputTokens) * 4 : null,
    llm_calls: hasCost ? costSummary.total_llm_calls : null,
    estimated_cost_usd: hasCost ? costSummary.total_estimated_cost_usd : null,
    // Failures are the highest-value content on the page — never omitted.
    failed_analyses: progress?.failed_analyses ?? 0,
    failed_keyword_syntheses: progress?.failed_keyword_syntheses ?? 0,
    failed_topic_syntheses: progress?.failed_topic_syntheses ?? 0,
  };
}

export type ResearchKpis = ReturnType<typeof researchKpis>;

/** Total failures across the three failing stages — the amber number on screen. */
export function researchFailureCount(kpis: ResearchKpis): number {
  return (
    kpis.failed_analyses +
    kpis.failed_keyword_syntheses +
    kpis.failed_topic_syntheses
  );
}

/**
 * Flat scalars for the payload envelope `attributes` — the same KPIs, in the
 * shape `buildAgentPayload` renders onto the root tag.
 */
export function researchKpiAttributes(kpis: ResearchKpis) {
  return {
    keywords: kpis.keywords,
    sources: `${kpis.sources_included}/${kpis.sources_total}`,
    pages_read: kpis.pages_read,
    analyses: `${kpis.analyses}/${kpis.analyses_eligible}`,
    keyword_syntheses: kpis.keyword_syntheses,
    topic_syntheses: kpis.topic_syntheses,
    llm_calls: kpis.llm_calls,
    estimated_cost_usd: kpis.estimated_cost_usd,
    failures: researchFailureCount(kpis),
  };
}

/** The receipt, as the human reads it on screen. */
export function researchKpiLines(kpis: ResearchKpis): string {
  return humanLines([
    ["Keywords", kpis.keywords],
    ["Sources discovered", `${kpis.sources_included} / ${kpis.sources_total}`],
    ["Pages read", kpis.pages_read],
    ["Pages analyzed", `${kpis.analyses} / ${kpis.analyses_eligible}`],
    ["Keyword syntheses", `${kpis.keyword_syntheses} / ${kpis.keywords}`],
    ["Project report", kpis.topic_syntheses > 0 ? "Generated" : "Not yet"],
    ["Characters processed", kpis.characters_processed],
    ["LLM calls", kpis.llm_calls],
    ["AI cost (USD)", kpis.estimated_cost_usd],
    ["Failures", researchFailureCount(kpis) || null],
  ]);
}

// ── Sources ───────────────────────────────────────────────────────────────

export function sourceSummary(s: ResearchSource): string {
  return humanLines([
    ["Title", s.title ?? s.url],
    ["URL", s.url],
    ["Host", s.hostname],
    ["Type", s.source_type],
    ["Origin", s.origin],
    ["Included", s.is_included ? "yes" : "no"],
    ["Scrape status", s.scrape_status],
    ["Authority", s.authority_score],
    ["Authority tier", s.authority_tier],
    ["Why", s.authority_reasoning],
    ["Pre-read score", s.pre_read_score],
    ["Post-read score", s.post_read_score],
    ["Final score", s.final_source_score],
    ["Recommended use", s.recommended_use],
    ["Analysis status", s.analysis_status],
  ]);
}

/** Compact projection for the "Key fields" variant and CSV export. */
export function sourceBrief(s: ResearchSource) {
  return {
    id: s.id,
    url: s.url,
    title: s.title,
    hostname: s.hostname,
    source_type: s.source_type,
    origin: s.origin,
    is_included: s.is_included,
    scrape_status: s.scrape_status,
    authority_score: s.authority_score,
    authority_tier: s.authority_tier,
    pre_read_score: s.pre_read_score,
    post_read_score: s.post_read_score,
    final_source_score: s.final_source_score,
    recommended_use: s.recommended_use,
    analysis_status: s.analysis_status,
  };
}

export function sourcesListSummary(sources: ResearchSource[]): string {
  return sources
    .map(
      (s) =>
        `${s.is_included ? "[included]" : "[excluded]"} ${s.title ?? s.url} · ${s.hostname ?? "—"} · ${s.scrape_status}${
          s.authority_score != null ? ` · authority ${s.authority_score}` : ""
        }`,
    )
    .join("\n");
}

export const SOURCE_CSV_COLUMNS = [
  { key: "id", header: "ID" },
  { key: "url", header: "URL" },
  { key: "title", header: "Title" },
  { key: "hostname", header: "Host" },
  { key: "source_type", header: "Type" },
  { key: "origin", header: "Origin" },
  { key: "is_included", header: "Included" },
  { key: "scrape_status", header: "Scrape status" },
  { key: "authority_score", header: "Authority" },
  { key: "authority_tier", header: "Authority tier" },
  { key: "pre_read_score", header: "Pre-read" },
  { key: "post_read_score", header: "Post-read" },
  { key: "final_source_score", header: "Final score" },
  { key: "recommended_use", header: "Recommended use" },
  { key: "analysis_status", header: "Analysis status" },
];

// ── Keywords ──────────────────────────────────────────────────────────────

export function keywordSummary(k: ResearchKeyword): string {
  return humanLines([
    ["Keyword", k.keyword],
    ["Goal (lens)", k.goal],
    ["Position", k.position],
    ["Provider", k.search_provider],
    ["Results", k.result_count],
    ["Last searched", k.last_searched_at],
    ["Stale", k.is_stale ? "yes" : "no"],
  ]);
}

export function keywordBrief(k: ResearchKeyword) {
  return {
    id: k.id,
    keyword: k.keyword,
    goal: k.goal,
    position: k.position,
    search_provider: k.search_provider,
    result_count: k.result_count,
    last_searched_at: k.last_searched_at,
    is_stale: k.is_stale,
  };
}

export function keywordsListSummary(keywords: ResearchKeyword[]): string {
  return keywords
    .map(
      (k) =>
        `${k.position}. ${k.keyword}${k.goal ? ` — ${k.goal}` : ""} · ${k.search_provider} · ${k.result_count ?? 0} results${
          k.is_stale ? " · stale" : ""
        }`,
    )
    .join("\n");
}

export const KEYWORD_CSV_COLUMNS = [
  { key: "id", header: "ID" },
  { key: "keyword", header: "Keyword" },
  { key: "goal", header: "Goal" },
  { key: "position", header: "Position" },
  { key: "search_provider", header: "Provider" },
  { key: "result_count", header: "Results" },
  { key: "last_searched_at", header: "Last searched" },
  { key: "is_stale", header: "Stale" },
];

// ── Syntheses ─────────────────────────────────────────────────────────────

export function synthesisSummary(s: ResearchSynthesis): string {
  return humanLines([
    ["Scope", s.scope],
    ["Status", s.status],
    ["Agent", s.agent_type],
    ["Model", s.model_id],
    ["Version", s.version],
    ["Current", s.is_current ? "yes" : "no"],
    ["Created", s.created_at],
    // Errors first — the highest-value content when a synthesis failed.
    ["Error", s.error],
    ["Result", s.result],
  ]);
}

/**
 * Compact projection. `result` is the whole point of a synthesis, so the brief
 * keeps a bounded head of it plus an HONEST note of what was cut — a stub must
 * always state how much it dropped so the agent knows to ask for the rest.
 * `resultChars = 0` means unlimited.
 */
export function synthesisBrief(s: ResearchSynthesis, resultChars = 800) {
  const result = s.result ?? "";
  const truncated = resultChars > 0 && result.length > resultChars;
  return {
    id: s.id,
    scope: s.scope,
    status: s.status,
    agent_type: s.agent_type,
    model_id: s.model_id,
    version: s.version,
    is_current: s.is_current,
    keyword_id: s.keyword_id,
    tag_id: s.tag_id,
    created_at: s.created_at,
    error: s.error,
    result: truncated ? result.slice(0, resultChars) : result,
    result_chars: result.length,
    result_truncated: truncated
      ? `omitted ${result.length - resultChars} of ${result.length} chars`
      : undefined,
  };
}

export function synthesesListSummary(syntheses: ResearchSynthesis[]): string {
  return syntheses
    .map(
      (s) =>
        `${s.scope} v${s.version ?? 1} · ${s.status}${s.is_current ? " · current" : ""} · ${
          s.result?.length ?? 0
        } chars${s.error ? ` · ERROR: ${s.error}` : ""}`,
    )
    .join("\n");
}

export const SYNTHESIS_CSV_COLUMNS = [
  { key: "id", header: "ID" },
  { key: "scope", header: "Scope" },
  { key: "status", header: "Status" },
  { key: "agent_type", header: "Agent" },
  { key: "model_id", header: "Model" },
  { key: "version", header: "Version" },
  { key: "is_current", header: "Current" },
  { key: "result_chars", header: "Result chars" },
  { key: "error", header: "Error" },
  { key: "created_at", header: "Created" },
];

// ── Analyses ──────────────────────────────────────────────────────────────

export function analysisSummary(a: ResearchAnalysis): string {
  return humanLines([
    ["Status", a.status],
    ["Agent", a.agent_type],
    ["Model", a.model_id],
    ["Source", a.source_id],
    ["Created", a.created_at],
    ["Error", a.error],
    ["Result", a.result],
  ]);
}

export function analysisBrief(a: ResearchAnalysis, resultChars = 800) {
  const result = a.result ?? "";
  const truncated = resultChars > 0 && result.length > resultChars;
  return {
    id: a.id,
    source_id: a.source_id,
    content_id: a.content_id,
    status: a.status,
    agent_type: a.agent_type,
    model_id: a.model_id,
    created_at: a.created_at,
    error: a.error,
    result: truncated ? result.slice(0, resultChars) : result,
    result_chars: result.length,
    result_truncated: truncated
      ? `omitted ${result.length - resultChars} of ${result.length} chars`
      : undefined,
  };
}

export function analysesListSummary(analyses: ResearchAnalysis[]): string {
  return analyses
    .map(
      (a) =>
        `${a.status} · ${a.agent_type} · ${a.result?.length ?? 0} chars${
          a.error ? ` · ERROR: ${a.error}` : ""
        }`,
    )
    .join("\n");
}

export const ANALYSIS_CSV_COLUMNS = [
  { key: "id", header: "ID" },
  { key: "source_id", header: "Source ID" },
  { key: "status", header: "Status" },
  { key: "agent_type", header: "Agent" },
  { key: "model_id", header: "Model" },
  { key: "result_chars", header: "Result chars" },
  { key: "error", header: "Error" },
  { key: "created_at", header: "Created" },
];
