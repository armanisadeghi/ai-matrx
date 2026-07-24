/**
 * features/research/costs.ts
 *
 * Pure cost ledger for a research topic: raw LLM rows in, per-call ledger +
 * per-phase + per-model rollups + `TopicCostSummary` out. No I/O, no React —
 * `service.getTopicCostLedger` fetches, this shapes, `useTopicCosts` serves.
 *
 * WHY THIS IS CLIENT-SIDE. Every input is a plain RLS-filtered row read of
 * `research.rs_analysis` / `rs_synthesis` / `rs_document` — exactly the reads
 * the Analysis and Document pages already do direct via supabase-js. Routing
 * them through aidream's `GET /research/topics/{id}/costs` was two extra hops
 * through a slow, agent-saturated server to re-derive numbers the browser
 * already holds, and it could only ever return five aggregate buckets — never
 * the per-call detail this file produces. Per CLAUDE.md ("one canonical path
 * per operation"; "never call the Python backend for work the browser can do
 * directly against Postgres"), the direct read is the canonical path. The
 * Python endpoint stays for consumers without Supabase access.
 *
 * The totals produced here are byte-for-byte the contract the backend emitted
 * (`TopicCostSummary`), so every existing consumer — PipelineOrchestra,
 * LastRunSummary, LivePipelineActivity — keeps working unchanged.
 */

import {
  normalizeTokenUsage,
  rollupByModel,
  type NormalizedUsage,
  type NormalizedUsageModel,
} from "@/lib/token-usage/normalize";
import type { CostBreakdownItem, TopicCostSummary } from "./types";

// ── Phases ─────────────────────────────────────────────────────────────────

export type CostPhase =
  | "page_analyses"
  | "keyword_syntheses"
  | "topic_syntheses"
  | "tag_consolidations"
  | "document_assembly";

export const COST_PHASES: readonly CostPhase[] = [
  "page_analyses",
  "keyword_syntheses",
  "topic_syntheses",
  "tag_consolidations",
  "document_assembly",
] as const;

export const COST_PHASE_LABELS: Record<CostPhase, string> = {
  page_analyses: "Page Analyses",
  keyword_syntheses: "Keyword Syntheses",
  topic_syntheses: "Topic Syntheses",
  tag_consolidations: "Tag Consolidations",
  document_assembly: "Document Assembly",
};

// ── Raw input rows (only the columns the ledger needs) ─────────────────────

/** The shared column subset every LLM-writing research table exposes. */
export interface CostLedgerRow {
  id: string;
  agent_type: string | null;
  agent_id: string | null;
  model_id: string | null;
  status: string | null;
  created_at: string | null;
  token_usage: unknown;
}

/** `rs_synthesis` additionally carries the scope that decides its phase. */
export interface SynthesisCostRow extends CostLedgerRow {
  scope: string | null;
  keyword_id: string | null;
  tag_id: string | null;
}

export interface CostLedgerInput {
  analyses: CostLedgerRow[];
  syntheses: SynthesisCostRow[];
  documents: CostLedgerRow[];
  /** keyword_id → keyword text, so a ledger row can name what it worked on. */
  keywordNames?: Record<string, string>;
  /** tag_id → tag name, same purpose. */
  tagNames?: Record<string, string>;
}

// ── Ledger ─────────────────────────────────────────────────────────────────

/** One persisted AI call, ready to render as a table row. */
export interface CostLedgerEntry {
  id: string;
  phase: CostPhase;
  phaseLabel: string;
  /** The agent that ran, e.g. "page_summary", "keyword_synthesis". */
  agentType: string | null;
  /** What this call was about — keyword text, tag name, or the phase name. */
  subject: string;
  status: string;
  succeeded: boolean;
  createdAt: string | null;
  /** Model names the call actually used, from `token_usage.by_model`. */
  models: string[];
  /** Provider families behind those models ("openai", "google", …). */
  providers: string[];
  usage: NormalizedUsage | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requests: number;
  /** Null = unpriced (render "—"), never conflate with 0. */
  costUsd: number | null;
}

export interface PhaseRollup extends CostBreakdownItem {
  phase: CostPhase;
  cached_input_tokens: number;
  failed_calls: number;
  /** False when any call in the phase could not be priced. */
  cost_is_complete: boolean;
}

export interface TopicCostLedger {
  /** Every AI call, newest first. */
  entries: CostLedgerEntry[];
  phases: PhaseRollup[];
  models: NormalizedUsageModel[];
  totals: {
    calls: number;
    failedCalls: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
    /** False when at least one call could not be priced. */
    costIsComplete: boolean;
    unpricedCalls: number;
  };
  /** The exact backend contract, so existing consumers need no changes. */
  summary: TopicCostSummary;
}

/**
 * Whole-topic synthesis is canonically `scope='topic'`. Historical rows still
 * carry `'project'`; both land in the same bucket (see FEATURE.md § synthesis
 * vocabulary). An unrecognized scope falls back to keyword rather than being
 * dropped — a call we can't classify must still be paid for and shown.
 */
function phaseForSynthesis(scope: string | null): CostPhase {
  if (scope === "topic" || scope === "project") return "topic_syntheses";
  if (scope === "tag") return "tag_consolidations";
  return "keyword_syntheses";
}

function toEntry(
  row: CostLedgerRow,
  phase: CostPhase,
  subject: string,
): CostLedgerEntry {
  const usage = normalizeTokenUsage(row.token_usage);
  const status = row.status ?? "success";
  return {
    id: row.id,
    phase,
    phaseLabel: COST_PHASE_LABELS[phase],
    agentType: row.agent_type,
    subject,
    status,
    succeeded: status === "success",
    createdAt: row.created_at,
    models: usage?.models.map((m) => m.model) ?? [],
    providers: [
      ...new Set(
        (usage?.models ?? [])
          .map((m) => m.api)
          .filter((api): api is string => !!api),
      ),
    ],
    usage,
    inputTokens: usage?.inputTokens ?? 0,
    cachedInputTokens: usage?.cachedInputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    totalTokens: usage?.totalTokens ?? 0,
    requests: usage?.requests ?? 0,
    costUsd: usage?.costUsd ?? null,
  };
}

function rollupPhase(
  phase: CostPhase,
  entries: CostLedgerEntry[],
): PhaseRollup {
  // Only successful calls count toward billed totals — this mirrors the
  // backend's `_sum_usage`, which skips non-success rows. A failed call that
  // still burned tokens is surfaced separately as `failed_calls` rather than
  // being silently folded into the bill.
  const ok = entries.filter((e) => e.succeeded);
  return {
    phase,
    label: COST_PHASE_LABELS[phase],
    calls: ok.length,
    failed_calls: entries.length - ok.length,
    input_tokens: ok.reduce((n, e) => n + e.inputTokens, 0),
    cached_input_tokens: ok.reduce((n, e) => n + e.cachedInputTokens, 0),
    output_tokens: ok.reduce((n, e) => n + e.outputTokens, 0),
    estimated_cost_usd: round6(
      ok.reduce((n, e) => n + (e.costUsd ?? 0), 0),
    ),
    cost_is_complete: ok.every((e) => e.costUsd != null),
  };
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function toBreakdownItem(rollup: PhaseRollup): CostBreakdownItem {
  return {
    label: rollup.label,
    calls: rollup.calls,
    input_tokens: rollup.input_tokens,
    output_tokens: rollup.output_tokens,
    estimated_cost_usd: rollup.estimated_cost_usd,
  };
}

export function buildTopicCostLedger(input: CostLedgerInput): TopicCostLedger {
  const keywordNames = input.keywordNames ?? {};
  const tagNames = input.tagNames ?? {};

  const entries: CostLedgerEntry[] = [
    ...input.analyses.map((row) =>
      toEntry(row, "page_analyses", "Page analysis"),
    ),
    ...input.syntheses.map((row) => {
      const phase = phaseForSynthesis(row.scope);
      const subject =
        (row.keyword_id ? keywordNames[row.keyword_id] : undefined) ??
        (row.tag_id ? tagNames[row.tag_id] : undefined) ??
        COST_PHASE_LABELS[phase];
      return toEntry(row, phase, subject);
    }),
    ...input.documents.map((row) =>
      toEntry(row, "document_assembly", "Document assembly"),
    ),
  ].sort((a, b) => {
    // Newest first; rows with no timestamp sink to the bottom rather than
    // scrambling the order.
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const phases = COST_PHASES.map((phase) =>
    rollupPhase(
      phase,
      entries.filter((e) => e.phase === phase),
    ),
  );

  const ok = entries.filter((e) => e.succeeded);
  const totals = {
    calls: ok.length,
    failedCalls: entries.length - ok.length,
    inputTokens: ok.reduce((n, e) => n + e.inputTokens, 0),
    cachedInputTokens: ok.reduce((n, e) => n + e.cachedInputTokens, 0),
    outputTokens: ok.reduce((n, e) => n + e.outputTokens, 0),
    totalTokens: ok.reduce((n, e) => n + e.totalTokens, 0),
    costUsd: round6(ok.reduce((n, e) => n + (e.costUsd ?? 0), 0)),
    costIsComplete: ok.every((e) => e.costUsd != null),
    unpricedCalls: ok.filter((e) => e.costUsd == null).length,
  };

  const byPhase = new Map(phases.map((p) => [p.phase, p]));
  const item = (phase: CostPhase): CostBreakdownItem =>
    toBreakdownItem(byPhase.get(phase)!);

  const summary: TopicCostSummary = {
    total_llm_calls: totals.calls,
    total_input_tokens: totals.inputTokens,
    total_output_tokens: totals.outputTokens,
    total_estimated_cost_usd: totals.costUsd,
    page_analyses: item("page_analyses"),
    keyword_syntheses: item("keyword_syntheses"),
    topic_syntheses: item("topic_syntheses"),
    tag_consolidations: item("tag_consolidations"),
    document_assembly: item("document_assembly"),
  };

  return {
    entries,
    phases,
    models: rollupByModel(ok.map((e) => e.usage)),
    totals,
    summary,
  };
}
