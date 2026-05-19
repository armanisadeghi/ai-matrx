"use client";

/**
 * RunsComparisonTable
 *
 * Comprehensive comparison surface. Layout:
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
import { useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import type { ActiveRequest } from "@/features/agents/types/request.types";
import {
  addUsageTotals,
  fmtBytes,
  fmtCost,
  fmtMs,
  fmtTokens,
  getUserRequestResult,
  type MutableTotals,
} from "@/features/agents/components/run-controls/panels/shared";
import { cn } from "@/lib/utils";
import {
  selectActiveBattleColumns,
  type BattleColumnDescriptor,
} from "../shared/activeBattleColumns";

// =============================================================================
// Per-column derived stats — everything we know about one column's runs
// =============================================================================

interface ColumnStats {
  columnId: string;
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
  "columnId" | "agentName" | "versionLabel" | "status"
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
    | RootState["agentComparison"]["feedbackByConversation"]
    | undefined;
  contextByConversation:
    | RootState["contextState"]["byConversationId"]
    | undefined;
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

interface MetricRow {
  label: string;
  pick: (s: ColumnStats) => number | null;
  format: (v: number | null) => string;
  direction: Direction;
  emphasized?: boolean;
}

interface MetricSection {
  title: string;
  rows: MetricRow[];
}

const fmtScore = (v: number | null) => (v == null ? "—" : `${v} / 5`);
const fmtRank = (v: number | null) => (v == null ? "—" : `#${v}`);

const SECTIONS: MetricSection[] = [
  {
    title: "Your evaluation",
    rows: [
      {
        label: "Rank",
        pick: (s) => s.fbRank,
        format: fmtRank,
        direction: "lower", // rank 1 is best
        emphasized: true,
      },
      {
        label: "Overall",
        pick: (s) => s.fbOverall,
        format: fmtScore,
        direction: "higher",
        emphasized: true,
      },
      {
        label: "Accuracy",
        pick: (s) => s.fbAccuracy,
        format: fmtScore,
        direction: "higher",
      },
      {
        label: "Relevance",
        pick: (s) => s.fbRelevance,
        format: fmtScore,
        direction: "higher",
      },
      {
        label: "Completeness",
        pick: (s) => s.fbCompleteness,
        format: fmtScore,
        direction: "higher",
      },
      {
        label: "Instruction following",
        pick: (s) => s.fbInstructionFollowing,
        format: fmtScore,
        direction: "higher",
      },
      {
        label: "Reasoning",
        pick: (s) => s.fbReasoning,
        format: fmtScore,
        direction: "higher",
      },
      {
        label: "Clarity",
        pick: (s) => s.fbClarity,
        format: fmtScore,
        direction: "higher",
      },
      {
        label: "Conciseness",
        pick: (s) => s.fbConciseness,
        format: fmtScore,
        direction: "higher",
      },
    ],
  },
  {
    title: "Summary",
    rows: [
      {
        label: "Total tokens",
        pick: (s) => s.tokensTotal,
        format: fmtTokens,
        direction: "lower",
        emphasized: true,
      },
      {
        label: "Cost",
        pick: (s) => s.cost,
        format: fmtCost,
        direction: "lower",
        emphasized: true,
      },
      {
        label: "Server total duration",
        pick: (s) => s.serverDurationTotal,
        format: fmtMs,
        direction: "lower",
        emphasized: true,
      },
      {
        label: "Client TTFT",
        pick: (s) => s.clientTtftMs,
        format: fmtMs,
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
        direction: "lower",
      },
      {
        label: "Cached tokens",
        pick: (s) => s.tokensCached,
        format: fmtTokens,
        direction: "higher",
      },
      {
        label: "Output tokens",
        pick: (s) => s.tokensOutput,
        format: fmtTokens,
        direction: "lower",
      },
      {
        label: "Total tokens",
        pick: (s) => s.tokensTotal,
        format: fmtTokens,
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
        format: fmtMs,
        direction: "lower",
      },
      {
        label: "API duration",
        pick: (s) => s.serverDurationApi,
        format: fmtMs,
        direction: "lower",
      },
      {
        label: "Tool duration",
        pick: (s) => s.serverDurationTool,
        format: fmtMs,
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
        direction: "lower",
      },
      {
        label: "Internal latency",
        pick: (s) => s.clientInternalLatencyMs,
        format: fmtMs,
        direction: "lower",
      },
      {
        label: "Stream duration",
        pick: (s) => s.clientStreamDurationMs,
        format: fmtMs,
        direction: "lower",
      },
      {
        label: "Render delay",
        pick: (s) => s.clientRenderDelayMs,
        format: fmtMs,
        direction: "lower",
      },
      {
        label: "Total client",
        pick: (s) => s.clientTotalDurationMs,
        format: fmtMs,
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
        direction: "lower",
      },
      {
        label: "Estimated tokens",
        pick: (s) => s.ctxEstimatedTokens,
        format: fmtTokens,
        direction: "lower",
      },
      {
        label: "Last input tokens",
        pick: (s) => s.ctxLastReqInput,
        format: fmtTokens,
        direction: "lower",
      },
      {
        label: "Last cached tokens",
        pick: (s) => s.ctxLastReqCached,
        format: fmtTokens,
        direction: "higher",
      },
      {
        label: "Last output tokens",
        pick: (s) => s.ctxLastReqOutput,
        format: fmtTokens,
        direction: "lower",
      },
      {
        label: "Visible chars",
        pick: (s) => s.ctxVisibleChars,
        format: fmtTokens,
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
        format: fmtBytes,
        direction: "lower",
      },
      {
        label: "Total payload",
        pick: (s) => s.clientTotalPayloadBytes,
        format: fmtBytes,
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

// =============================================================================
// Highlights — min/max per row given a direction
// =============================================================================

type Highlight = "best" | "worst" | null;

function computeRowHighlights(
  row: MetricRow,
  cols: ColumnStats[],
): Record<string, Highlight> {
  const out: Record<string, Highlight> = {};
  if (row.direction === "none") return out;
  const values = cols
    .map((c) => ({ id: c.columnId, v: row.pick(c) }))
    .filter((x): x is { id: string; v: number } => x.v != null);
  if (values.length < 2) return out;
  let min = values[0];
  let max = values[0];
  for (const x of values.slice(1)) {
    if (x.v < min.v) min = x;
    if (x.v > max.v) max = x;
  }
  if (min.v === max.v) return out;
  if (row.direction === "lower") {
    out[min.id] = "best";
    out[max.id] = "worst";
  } else {
    out[max.id] = "best";
    out[min.id] = "worst";
  }
  return out;
}

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
);

// =============================================================================
// Component
// =============================================================================

export function RunsComparisonTable() {
  const stats = useAppSelector(selectRunsComparisonColumnStats);

  if (stats.length === 0) return null;

  return (
    <div className="space-y-3 p-3">
      <ColumnHeaderStrip stats={stats} />
      {SECTIONS.map((section) => (
        <SectionTable key={section.title} section={section} stats={stats} />
      ))}
    </div>
  );
}

function ColumnHeaderStrip({ stats }: { stats: ColumnStats[] }) {
  return (
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
      Comparing {stats.length} column{stats.length === 1 ? "" : "s"} ·
      <span className="ml-1 text-emerald-500 font-semibold">green</span> = best,
      <span className="ml-1 text-rose-500 font-semibold">red</span> = worst
      (computed per row across columns with values)
    </div>
  );
}

function SectionTable({
  section,
  stats,
}: {
  section: MetricSection;
  stats: ColumnStats[];
}) {
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="px-3 py-1.5 bg-muted/40 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {section.title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border bg-card/50">
              <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground sticky left-0 bg-card/50 min-w-[160px]">
                Metric
              </th>
              {stats.map((s) => (
                <th
                  key={s.columnId}
                  className="text-right px-3 py-1.5 font-semibold text-foreground min-w-[140px]"
                  title={`${s.agentName} · ${s.versionLabel}`}
                >
                  <div className="truncate max-w-[180px] inline-block align-bottom">
                    {s.agentName}
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground/70 font-normal">
                    {s.versionLabel}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row) => {
              const highlights = computeRowHighlights(row, stats);
              return (
                <tr
                  key={row.label}
                  className="border-b border-border/40 last:border-b-0 hover:bg-muted/10"
                >
                  <td
                    className={cn(
                      "px-3 py-1 text-muted-foreground sticky left-0 bg-background",
                      row.emphasized && "font-semibold text-foreground",
                    )}
                  >
                    {row.label}
                  </td>
                  {stats.map((s) => {
                    const v = row.pick(s);
                    const hl = highlights[s.columnId] ?? null;
                    return (
                      <td
                        key={s.columnId}
                        className={cn(
                          "px-3 py-1 text-right font-mono",
                          hl === "best" && "text-emerald-500 font-semibold",
                          hl === "worst" && "text-rose-500 font-semibold",
                        )}
                      >
                        {row.format(v)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
