/**
 * runsComparisonData — everything the runs comparison KNOWS, as data: each
 * column's derived stats, the metric sections, highlights, and the selector
 * that applies blind masking. The window (`RunsComparisonTable`), the report
 * (`runsComparisonReport`) and the rankings (`runsRanking`) all read it here.
 *
 * Layout of the comparison:
 *   - Rows = metrics
 *   - Columns = agents (one per battle column)
 *
 * Several grouped tables (Summary, Tokens, Timing, Operations, Payload,
 * Event counts, Records, Model Context). For each numeric metric row we
 * compute a min/max across the columns and highlight the winner
 * (green = lower-is-better → tokens/cost/duration) or
 * (green = higher-is-better → throughput-style fields). Ties + single-row
 * data suppress the highlight.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { ActiveRequest } from "@ai-matrx/chat/agents/types/request.types";
import { formatFileSize, type CostUnit } from "@ai-matrx/kit/format";
import {
  addUsageTotals,
  fmtCost,
  fmtMs,
  fmtServerSeconds,
  fmtTokens,
  getUserRequestResult,
  requestTtftMs,
  type MutableTotals,
} from "@ai-matrx/chat/agents/components/run-controls/panels/shared";
import {
  selectActiveBattleColumns,
  readsCatalogOptions,
  type BattleColumnDescriptor,
} from "../shared/activeBattleColumns";
import { selectBlindActive, selectBlindOrder } from "../redux/selectors";
import { blindAnonLabel } from "../shared/blind";

// =============================================================================
// Per-column derived stats — everything we know about one column's runs
// =============================================================================

export interface ColumnStats {
  columnId: string;
  agentId: string | null;
  agentName: string;
  versionLabel: string;
  status: string;

  // Feedback (from cmp_response_feedback, mirrored into the slice)
  fbOverall: number | null;
  fbRank: number | null;
  fbAccuracy: number | null;
  fbRelevance: number | null;
  fbCompleteness: number | null;
  fbInstructionFollowing: number | null;
  fbReasoning: number | null;
  fbClarity: number | null;
  fbConciseness: number | null;

  // Token usage
  tokensInput: number | null;
  tokensCached: number | null;
  tokensOutput: number | null;
  tokensTotal: number | null;

  // Cost & timing (server-reported)
  cost: number | null;
  serverDurationTotal: number | null;
  serverDurationApi: number | null;
  serverDurationTool: number | null;

  // Operations
  rounds: number;
  completedRounds: number;
  erroredRounds: number;
  iterations: number | null;
  llmCalls: number | null;
  toolCalls: number | null;

  /** Time to first token of the last run — the browser's, else the server's (survives reload). */
  ttftMs: number | null;
  // Client metrics (last request)
  clientTtftMs: number | null;
  clientStreamDurationMs: number | null;
  clientRenderDelayMs: number | null;
  clientInternalLatencyMs: number | null;
  clientTotalDurationMs: number | null;
  clientAccumulatedBytes: number | null;
  clientTotalPayloadBytes: number | null;

  // Event counts (last request)
  evTotal: number | null;
  evChunks: number | null;
  evReasoning: number | null;
  evPhases: number | null;
  evTool: number | null;
  evRenderBlocks: number | null;
  evInit: number | null;
  evCompletion: number | null;
  evData: number | null;
  evRecordReserved: number | null;
  evRecordUpdate: number | null;
  evResourceChanged: number | null;
  evWarnings: number | null;
  evInfo: number | null;
  evOther: number | null;

  // Context state (model context tab)
  ctxEstimatedTokens: number | null;
  ctxFillPct: number | null;
  ctxVisibleChars: number | null;
  ctxVisibleMessages: number | null;
  ctxLastReqInput: number | null;
  ctxLastReqCached: number | null;
  ctxLastReqOutput: number | null;
}

const NULL_STATS = (): Omit<
  ColumnStats,
  "columnId" | "agentId" | "agentName" | "versionLabel" | "status"
> => ({
  fbOverall: null,
  fbRank: null,
  fbAccuracy: null,
  fbRelevance: null,
  fbCompleteness: null,
  fbInstructionFollowing: null,
  fbReasoning: null,
  fbClarity: null,
  fbConciseness: null,
  tokensInput: null,
  tokensCached: null,
  tokensOutput: null,
  tokensTotal: null,
  cost: null,
  serverDurationTotal: null,
  serverDurationApi: null,
  serverDurationTool: null,
  rounds: 0,
  completedRounds: 0,
  erroredRounds: 0,
  iterations: null,
  llmCalls: null,
  toolCalls: null,
  ttftMs: null,
  clientTtftMs: null,
  clientStreamDurationMs: null,
  clientRenderDelayMs: null,
  clientInternalLatencyMs: null,
  clientTotalDurationMs: null,
  clientAccumulatedBytes: null,
  clientTotalPayloadBytes: null,
  evTotal: null,
  evChunks: null,
  evReasoning: null,
  evPhases: null,
  evTool: null,
  evRenderBlocks: null,
  evInit: null,
  evCompletion: null,
  evData: null,
  evRecordReserved: null,
  evRecordUpdate: null,
  evResourceChanged: null,
  evWarnings: null,
  evInfo: null,
  evOther: null,
  ctxEstimatedTokens: null,
  ctxFillPct: null,
  ctxVisibleChars: null,
  ctxVisibleMessages: null,
  ctxLastReqInput: null,
  ctxLastReqCached: null,
  ctxLastReqOutput: null,
});

function makeEmptyTotals(): MutableTotals {
  return { input: 0, output: 0, cached: 0, total: 0, cost: 0, requests: 0 };
}

interface ColumnStatsDeps {
  agents: RootState["agentDefinition"]["agents"];
  activeRequests: RootState["activeRequests"];
  feedbackByConversation:
    RootState["agentComparison"]["feedbackByConversation"] | undefined;
  contextByConversation:
    RootState["contextState"]["byConversationId"] | undefined;
}

function buildStatsForColumn(
  col: BattleColumnDescriptor,
  deps: ColumnStatsDeps,
): ColumnStats {
  const agent = col.agentId ? deps.agents?.[col.agentId] : undefined;
  const displayName =
    col.label && col.label.trim().length > 0
      ? col.label
      : (agent?.name ?? "Unconfigured");
  const base = {
    columnId: col.columnId,
    agentId: col.agentId ?? null,
    agentName: displayName,
    versionLabel:
      col.agentVersion == null
        ? "—"
        : col.agentVersion === "current"
          ? "current"
          : `v${col.agentVersion}`,
    status: "—",
    ...NULL_STATS(),
  };

  const requestIds = deps.activeRequests.byConversationId[col.conversationId];
  const requests: ActiveRequest[] = requestIds
    ? requestIds
        .map((id) => deps.activeRequests.byRequestId[id])
        .filter((r): r is ActiveRequest => Boolean(r))
    : [];

  fillFeedback(base, deps.feedbackByConversation, col.conversationId);

  if (requests.length === 0) {
    // No runs yet — still surface context-state if present (cold-start fetch).
    fillContextState(base, deps.contextByConversation, col.conversationId);
    return base;
  }

  const totals = makeEmptyTotals();
  let durTotal = 0;
  let durApi = 0;
  let durTool = 0;
  let toolCalls = 0;
  let iterations = 0;
  let completed = 0;
  let errored = 0;

  for (const req of requests) {
    const result = getUserRequestResult(req);
    if (result) {
      addUsageTotals(totals, result.total_usage?.total);
      const timing = result.timing_stats;
      durTotal += timing?.total_duration ?? 0;
      durApi += timing?.api_duration ?? 0;
      durTool += timing?.tool_duration ?? 0;
      toolCalls += result.tool_call_stats?.total_tool_calls ?? 0;
      iterations += result.iterations ?? 0;
    }
    if (req.status === "complete") completed++;
    else if (req.status === "error") errored++;
  }

  const last = requests[requests.length - 1];

  base.status = last.status ?? "—";
  base.rounds = requests.length;
  base.completedRounds = completed;
  base.erroredRounds = errored;
  base.iterations = iterations || null;
  base.llmCalls = totals.requests || null;
  base.toolCalls = toolCalls || null;

  base.tokensInput = totals.input || null;
  base.tokensCached = totals.cached || null;
  base.tokensOutput = totals.output || null;
  base.tokensTotal = totals.total || null;
  base.cost = totals.cost || null;
  base.serverDurationTotal = durTotal || null;
  base.serverDurationApi = durApi || null;
  base.serverDurationTool = durTool || null;

  // Client metrics — pull from the LAST request (most recent run is the
  // most informative single-shot perf number; aggregating multi-turn TTFT
  // would mislead).
  base.ttftMs = requestTtftMs(last);
  const m = last.clientMetrics;
  if (m) {
    base.clientTtftMs = m.ttftMs ?? null;
    base.clientStreamDurationMs = m.streamDurationMs ?? null;
    base.clientRenderDelayMs = m.renderDelayMs ?? null;
    base.clientInternalLatencyMs = m.internalLatencyMs ?? null;
    base.clientTotalDurationMs = m.totalClientDurationMs ?? null;
    base.clientAccumulatedBytes = m.accumulatedTextBytes ?? null;
    base.clientTotalPayloadBytes = m.totalPayloadBytes ?? null;
    base.evTotal = m.totalEvents ?? null;
    base.evChunks = m.chunkEvents ?? null;
    base.evReasoning = m.reasoningChunkEvents ?? null;
    base.evPhases = m.phaseEvents ?? null;
    base.evTool = m.toolEvents ?? null;
    base.evRenderBlocks = m.renderBlockEvents ?? null;
    base.evInit = m.initEvents ?? null;
    base.evCompletion = m.completionEvents ?? null;
    base.evData = m.dataEvents ?? null;
    base.evRecordReserved = m.recordReservedEvents ?? null;
    base.evRecordUpdate = m.recordUpdateEvents ?? null;
    base.evResourceChanged = m.resourceChangedEvents ?? null;
    base.evWarnings = m.warningEvents ?? null;
    base.evInfo = m.infoEvents ?? null;
    base.evOther = m.otherEvents ?? null;
  }

  fillContextState(base, deps.contextByConversation, col.conversationId);
  return base;
}

const CHARS_PER_TOKEN_ESTIMATE = 4;
const DEFAULT_CONTEXT_WINDOW_TOKENS = 200_000;

function fillFeedback(
  out: ColumnStats,
  feedbackByConversation: ColumnStatsDeps["feedbackByConversation"],
  conversationId: string,
) {
  const fb = feedbackByConversation?.[conversationId];
  if (!fb) return;
  out.fbOverall = fb.overall ?? null;
  out.fbRank = fb.rank ?? null;
  const s = fb.scores ?? {};
  out.fbAccuracy = s.accuracy ?? null;
  out.fbRelevance = s.relevance ?? null;
  out.fbCompleteness = s.completeness ?? null;
  out.fbInstructionFollowing = s.instruction_following ?? null;
  out.fbReasoning = s.reasoning ?? null;
  out.fbClarity = s.clarity ?? null;
  out.fbConciseness = s.conciseness ?? null;
}

function fillContextState(
  out: ColumnStats,
  contextByConversation: ColumnStatsDeps["contextByConversation"],
  conversationId: string,
) {
  const ctx = contextByConversation?.[conversationId];
  if (!ctx) return;
  const est =
    ctx.lastRequestInputTokens > 0
      ? ctx.lastRequestInputTokens + ctx.lastRequestCachedTokens
      : Math.ceil(ctx.totalCharsVisibleToModel / CHARS_PER_TOKEN_ESTIMATE);
  out.ctxEstimatedTokens = est || null;
  out.ctxFillPct =
    DEFAULT_CONTEXT_WINDOW_TOKENS > 0
      ? Math.round((est / DEFAULT_CONTEXT_WINDOW_TOKENS) * 100)
      : null;
  out.ctxVisibleChars = ctx.totalCharsVisibleToModel || null;
  out.ctxVisibleMessages = ctx.messageCountVisible || null;
  out.ctxLastReqInput = ctx.lastRequestInputTokens || null;
  out.ctxLastReqCached = ctx.lastRequestCachedTokens || null;
  out.ctxLastReqOutput = ctx.lastRequestOutputTokens || null;
}

// =============================================================================
// Metric row definitions — one place to declare the whole comparison
// =============================================================================

type Direction = "lower" | "higher" | "none";

export interface MetricRow {
  label: string;
  /**
   * Counts toward the Standings — the numbers a person decides on (their own
   * scores, tokens, cost, speed), never diagnostics like event counts.
   */
  scored?: boolean;
  pick: (s: ColumnStats) => number | null;
  /** `unit` is the viewer's cost unit — only cost rows read it. */
  format: (v: number | null, unit: CostUnit) => string;
  /** The raw value's unit, for saved data ("tokens", "USD", "seconds"…); absent = a count. */
  unit?: string;
  direction: Direction;
  emphasized?: boolean;
}

export interface MetricSection {
  title: string;
  rows: MetricRow[];
}

const fmtScore = (v: number | null) => (v == null ? "—" : `${v} / 5`);
const fmtRank = (v: number | null) => (v == null ? "—" : `#${v}`);

export const SECTIONS: MetricSection[] = [
  {
    title: "Your evaluation",
    rows: [
      {
        label: "Rank",
        scored: true,
        pick: (s) => s.fbRank,
        format: fmtRank,
        unit: "place",
        direction: "lower", // rank 1 is best
        emphasized: true,
      },
      {
        label: "Overall",
        scored: true,
        pick: (s) => s.fbOverall,
        format: fmtScore,
        unit: "out of 5",
        direction: "higher",
        emphasized: true,
      },
      {
        label: "Accuracy",
        pick: (s) => s.fbAccuracy,
        format: fmtScore,
        unit: "out of 5",
        direction: "higher",
      },
      {
        label: "Relevance",
        pick: (s) => s.fbRelevance,
        format: fmtScore,
        unit: "out of 5",
        direction: "higher",
      },
      {
        label: "Completeness",
        pick: (s) => s.fbCompleteness,
        format: fmtScore,
        unit: "out of 5",
        direction: "higher",
      },
      {
        label: "Instruction following",
        pick: (s) => s.fbInstructionFollowing,
        format: fmtScore,
        unit: "out of 5",
        direction: "higher",
      },
      {
        label: "Reasoning",
        pick: (s) => s.fbReasoning,
        format: fmtScore,
        unit: "out of 5",
        direction: "higher",
      },
      {
        label: "Clarity",
        pick: (s) => s.fbClarity,
        format: fmtScore,
        unit: "out of 5",
        direction: "higher",
      },
      {
        label: "Conciseness",
        pick: (s) => s.fbConciseness,
        format: fmtScore,
        unit: "out of 5",
        direction: "higher",
      },
    ],
  },
  {
    title: "Summary",
    rows: [
      {
        label: "Total tokens",
        // Not in the Standings: cost already carries it (counting both
        // scored the same thing twice).
        pick: (s) => s.tokensTotal,
        format: fmtTokens,
        unit: "tokens",
        direction: "lower",
        emphasized: true,
      },
      {
        label: "Cost",
        scored: true,
        pick: (s) => s.cost,
        format: fmtCost,
        unit: "USD",
        direction: "lower",
        emphasized: true,
      },
      {
        label: "Total duration",
        scored: true,
        pick: (s) => s.serverDurationTotal,
        format: fmtServerSeconds,
        unit: "seconds",
        direction: "lower",
        emphasized: true,
      },
      {
        label: "Time to first token",
        scored: true,
        pick: (s) => s.ttftMs,
        format: fmtMs,
        unit: "ms",
        direction: "lower",
        emphasized: true,
      },
      {
        label: "Rounds (turns)",
        pick: (s) => s.rounds || null,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "none",
      },
    ],
  },
  {
    title: "Token usage",
    rows: [
      {
        label: "Input tokens",
        pick: (s) => s.tokensInput,
        format: fmtTokens,
        unit: "tokens",
        direction: "lower",
      },
      {
        label: "Cached tokens",
        pick: (s) => s.tokensCached,
        format: fmtTokens,
        unit: "tokens",
        direction: "none",
      },
      {
        label: "Output tokens",
        pick: (s) => s.tokensOutput,
        format: fmtTokens,
        unit: "tokens",
        direction: "lower",
      },
      {
        label: "Total tokens",
        pick: (s) => s.tokensTotal,
        format: fmtTokens,
        unit: "tokens",
        direction: "lower",
      },
    ],
  },
  {
    title: "Server timing",
    rows: [
      {
        label: "Total duration",
        pick: (s) => s.serverDurationTotal,
        format: fmtServerSeconds,
        unit: "seconds",
        direction: "lower",
      },
      {
        label: "API duration",
        pick: (s) => s.serverDurationApi,
        format: fmtServerSeconds,
        unit: "seconds",
        direction: "lower",
      },
      {
        label: "Tool duration",
        pick: (s) => s.serverDurationTool,
        format: fmtServerSeconds,
        unit: "seconds",
        direction: "lower",
      },
    ],
  },
  {
    title: "Client timing (last run)",
    rows: [
      {
        label: "TTFT",
        pick: (s) => s.clientTtftMs,
        format: fmtMs,
        unit: "ms",
        direction: "lower",
      },
      {
        label: "Internal latency",
        pick: (s) => s.clientInternalLatencyMs,
        format: fmtMs,
        unit: "ms",
        direction: "lower",
      },
      {
        label: "Stream duration",
        pick: (s) => s.clientStreamDurationMs,
        format: fmtMs,
        unit: "ms",
        direction: "lower",
      },
      {
        label: "Render delay",
        pick: (s) => s.clientRenderDelayMs,
        format: fmtMs,
        unit: "ms",
        direction: "lower",
      },
      {
        label: "Total client",
        pick: (s) => s.clientTotalDurationMs,
        format: fmtMs,
        unit: "ms",
        direction: "lower",
      },
    ],
  },
  {
    title: "Operations",
    rows: [
      {
        label: "LLM calls",
        pick: (s) => s.llmCalls,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "lower",
      },
      {
        label: "Tool calls",
        pick: (s) => s.toolCalls,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "lower",
      },
      {
        label: "Σ Iterations",
        pick: (s) => s.iterations,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "lower",
      },
      {
        label: "Completed rounds",
        pick: (s) => s.completedRounds || null,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "none",
      },
      {
        label: "Errored rounds",
        pick: (s) => s.erroredRounds || null,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "lower",
      },
    ],
  },
  {
    title: "Model context (last run)",
    rows: [
      {
        label: "Context fill %",
        pick: (s) => s.ctxFillPct,
        format: (v) => (v == null ? "—" : `${v}%`),
        unit: "percent",
        direction: "lower",
      },
      {
        label: "Estimated tokens",
        pick: (s) => s.ctxEstimatedTokens,
        format: fmtTokens,
        unit: "tokens",
        direction: "lower",
      },
      {
        label: "Last input tokens",
        pick: (s) => s.ctxLastReqInput,
        format: fmtTokens,
        unit: "tokens",
        direction: "lower",
      },
      {
        label: "Last cached tokens",
        pick: (s) => s.ctxLastReqCached,
        format: fmtTokens,
        unit: "tokens",
        direction: "none",
      },
      {
        label: "Last output tokens",
        pick: (s) => s.ctxLastReqOutput,
        format: fmtTokens,
        unit: "tokens",
        direction: "lower",
      },
      {
        label: "Visible chars",
        pick: (s) => s.ctxVisibleChars,
        format: fmtTokens,
        unit: "tokens",
        direction: "lower",
      },
      {
        label: "Visible messages",
        pick: (s) => s.ctxVisibleMessages,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "none",
      },
    ],
  },
  {
    title: "Payload (last run)",
    rows: [
      {
        label: "Accumulated text",
        pick: (s) => s.clientAccumulatedBytes,
        format: (v) => formatFileSize(v),
        unit: "bytes",
        direction: "lower",
      },
      {
        label: "Total payload",
        pick: (s) => s.clientTotalPayloadBytes,
        format: (v) => formatFileSize(v),
        unit: "bytes",
        direction: "lower",
      },
    ],
  },
  {
    title: "Event counts (last run)",
    rows: [
      {
        label: "Total events",
        pick: (s) => s.evTotal,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "none",
      },
      {
        label: "Chunks",
        pick: (s) => s.evChunks,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "none",
      },
      {
        label: "Reasoning chunks",
        pick: (s) => s.evReasoning,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "none",
      },
      {
        label: "Phases",
        pick: (s) => s.evPhases,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "none",
      },
      {
        label: "Tool events",
        pick: (s) => s.evTool,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "none",
      },
      {
        label: "Render blocks",
        pick: (s) => s.evRenderBlocks,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "none",
      },
    ],
  },
  {
    title: "Records (last run)",
    rows: [
      {
        label: "Init",
        pick: (s) => s.evInit,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "none",
      },
      {
        label: "Completion",
        pick: (s) => s.evCompletion,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "none",
      },
      {
        label: "Data",
        pick: (s) => s.evData,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "none",
      },
      {
        label: "Reserved",
        pick: (s) => s.evRecordReserved,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "none",
      },
      {
        label: "Updated",
        pick: (s) => s.evRecordUpdate,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "none",
      },
      {
        label: "FS changes",
        pick: (s) => s.evResourceChanged,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "none",
      },
      {
        label: "Warnings",
        pick: (s) => s.evWarnings,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "lower",
      },
      {
        label: "Info",
        pick: (s) => s.evInfo,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "none",
      },
      {
        label: "Other",
        pick: (s) => s.evOther,
        format: (v) => (v == null ? "—" : String(v)),
        direction: "none",
      },
    ],
  },
];

const EMPTY_COLUMN_STATS: ColumnStats[] = [];

const selectActiveRequests = (state: RootState) => state.activeRequests;
const selectAgentDefinitionAgents = (state: RootState) =>
  state.agentDefinition.agents;
const selectComparisonFeedbackByConversation = (state: RootState) =>
  state.agentComparison?.feedbackByConversation;
const selectContextByConversation = (state: RootState) =>
  state.contextState?.byConversationId;

/** Memoized per-column stats — recomputes only when columns or run data change. */
const selectRunsComparisonColumnStats = createSelector(
  [
    selectActiveBattleColumns,
    selectActiveRequests,
    selectAgentDefinitionAgents,
    selectComparisonFeedbackByConversation,
    selectContextByConversation,
  ],
  (
    columns,
    activeRequests,
    agents,
    feedbackByConversation,
    contextByConversation,
  ): ColumnStats[] => {
    if (columns.length === 0) return EMPTY_COLUMN_STATS;
    const deps: ColumnStatsDeps = {
      agents,
      activeRequests,
      feedbackByConversation,
      contextByConversation,
    };
    return columns.map((col) => buildStatsForColumn(col, deps));
  },
  readsCatalogOptions,
);

/** Column identities and metric sections exactly as the table shows them (blind masking included). */
export const selectVisibleRunsComparison = createSelector(
  [selectRunsComparisonColumnStats, selectBlindActive, selectBlindOrder],
  (
    rawStats,
    blindActive,
    blindOrder,
  ): { stats: ColumnStats[]; sections: MetricSection[] } => {
    // During a blind test, anonymize the column identity (agent name +
    // version both leak which model ran) and show ONLY the user's own
    // evaluation rows — every metric section (tokens, cost, timing, …)
    // is a giveaway. The masks lift on Reveal.
    const stats = blindActive
      ? rawStats.map((s) => ({
          ...s,
          agentId: null,
          agentName: blindAnonLabel(s.columnId, blindOrder),
          versionLabel: "—",
        }))
      : rawStats;
    const sections = blindActive
      ? SECTIONS.filter((sec) => sec.title === "Your evaluation")
      : SECTIONS;
    return { stats, sections };
  },
  readsCatalogOptions,
);

