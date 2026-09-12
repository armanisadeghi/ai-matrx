"use client";

import { formatDurationMs } from "@ai-matrx/kit/format";

/**
 * Shared primitives for request/session stat panels.
 *
 * Source of truth: `activeRequests`. Each `ActiveRequest` carries:
 *   • completion.result (UserRequestResult) — server-side aggregated stats
 *     (tokens, cost, duration, iterations, finish_reason, tool_call_stats).
 *   • clientMetrics — client-side perf (TTFT, stream duration, render delay,
 *     event counts, payload bytes).
 *
 * ActiveRequest entries persist after stream completion and can be inspected.
 * These primitives are used by `RequestStatsPanel`, `SessionStatsPanel`, and
 * `ClientMetricsPanel`, which live both inside `CreatorRunPanel` and in the
 * `MessageAnalysisWindow` opened from a message's action menu.
 */

import React from "react";
import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { ActiveRequest } from "@/features/agents/types/request.types";
import type {
  UserRequestResult,
  UsageTotals,
} from "@/types/python-generated/stream-events";
import { cn } from "@/lib/utils";

// ── Selectors ──────────────────────────────────────────────────────────────

export const EMPTY_REQUEST_LIST: ActiveRequest[] = [];

/**
 * Returns ALL ActiveRequest records for this conversation, oldest first.
 * Memoized so callers re-render only when the record set actually changes.
 */
export function makeSelectConversationRequests(conversationId: string) {
  return createSelector(
    (state: RootState) => state.activeRequests.byConversationId[conversationId],
    (state: RootState) => state.activeRequests.byRequestId,
    (ids, byId): ActiveRequest[] => {
      if (!ids || ids.length === 0) return EMPTY_REQUEST_LIST;
      const out: ActiveRequest[] = [];
      for (const id of ids) {
        const rec = byId[id];
        if (rec) out.push(rec);
      }
      return out.length === 0 ? EMPTY_REQUEST_LIST : out;
    },
  );
}

/** Picks the newest ActiveRequest for this conversation, or undefined. */
export function makeSelectLastConversationRequest(conversationId: string) {
  return (state: RootState): ActiveRequest | undefined => {
    const ids = state.activeRequests.byConversationId[conversationId];
    if (!ids || ids.length === 0) return undefined;
    return state.activeRequests.byRequestId[ids[ids.length - 1]];
  };
}

/**
 * Resolve a request by id → record; returns undefined when missing.
 * Useful when a panel was opened with an explicit `requestId` (e.g. tied
 * to a specific assistant message via `_streamRequestId`).
 */
export function makeSelectRequestById(requestId: string) {
  return (state: RootState): ActiveRequest | undefined =>
    state.activeRequests.byRequestId[requestId];
}

// ── Formatters ─────────────────────────────────────────────────────────────

/** THE compact duration voice (@ai-matrx/kit/format): 250ms, 5.2s, 5m 30s. */
export function fmtMs(ms: number | null | undefined): string {
  return formatDurationMs(ms, { style: "compact" });
}

export function fmtTokens(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

export function fmtCost(cost: number | null | undefined): string {
  if (cost == null) return "—";
  if (cost === 0) return "$0";
  return `$${cost.toFixed(4)}`;
}

// ── Stats extractors ───────────────────────────────────────────────────────

/**
 * Pull `UserRequestResult` (the server's stats payload) out of an
 * ActiveRequest's completion event. `null` means the request hasn't reached
 * `completion` yet or it wasn't a user_request operation.
 */
export function getUserRequestResult(
  request: ActiveRequest | undefined,
): UserRequestResult | null {
  if (!request?.completion) return null;
  if (request.completion.operation !== "user_request") return null;
  const result = request.completion.result;
  if (!result || typeof result !== "object") return null;
  return result as UserRequestResult;
}

export interface MutableTotals {
  input: number;
  output: number;
  cached: number;
  total: number;
  cost: number;
  requests: number;
}

/**
 * Sum `UsageTotals` from one AggregatedUsageResult in-place into an
 * accumulator. Skips null/undefined inputs gracefully.
 */
export function addUsageTotals(
  acc: MutableTotals,
  usage: UsageTotals | undefined,
) {
  if (!usage) return;
  acc.input += usage.input_tokens ?? 0;
  acc.output += usage.output_tokens ?? 0;
  acc.cached += usage.cached_input_tokens ?? 0;
  acc.total += usage.total_tokens ?? 0;
  acc.cost += usage.total_cost ?? 0;
  acc.requests += usage.total_requests ?? 0;
}

// ── Display primitives ─────────────────────────────────────────────────────

export function StatRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-foreground/90", valueClassName)}>
        {value}
      </span>
    </div>
  );
}

export function StatSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 pb-0.5 border-b border-border/40 mb-1">
        {title}
      </div>
      {children}
    </div>
  );
}

export function EmptyStats({ text }: { text: string }) {
  return (
    <div className="p-4 text-xs text-muted-foreground text-center">{text}</div>
  );
}
