"use client";

/**
 * SessionStatsPanel — aggregated stats across every request in one
 * conversation. Mirrors the "Session" tab in the Creator Run Panel.
 */

import { useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  EmptyStats,
  StatRow,
  StatSection,
  addUsageTotals,
  fmtCost,
  fmtMs,
  fmtTokens,
  getUserRequestResult,
  makeSelectConversationRequests,
  type MutableTotals,
} from "./shared";

export interface SessionStatsPanelProps {
  conversationId: string;
}

export function SessionStatsPanel({ conversationId }: SessionStatsPanelProps) {
  const selector = useMemo(
    () => makeSelectConversationRequests(conversationId),
    [conversationId],
  );
  const requests = useAppSelector(selector);

  const stats = useMemo(() => {
    const totals: MutableTotals = {
      input: 0,
      output: 0,
      cached: 0,
      total: 0,
      cost: 0,
      requests: 0,
    };
    let totalDurationMs = 0;
    let apiDurationMs = 0;
    let toolDurationMs = 0;
    let totalToolCalls = 0;
    let iterationsSum = 0;
    let completedRounds = 0;
    let errorRounds = 0;

    for (const request of requests) {
      const result = getUserRequestResult(request);
      if (result) {
        addUsageTotals(totals, result.total_usage?.total);
        const timing = result.timing_stats;
        // timing_stats durations are SECONDS on the wire.
        totalDurationMs += (timing?.total_duration ?? 0) * 1000;
        apiDurationMs += (timing?.api_duration ?? 0) * 1000;
        toolDurationMs += (timing?.tool_duration ?? 0) * 1000;
        totalToolCalls += result.tool_call_stats?.total_tool_calls ?? 0;
        iterationsSum += result.iterations ?? 0;
      }
      if (request.status === "complete") completedRounds++;
      else if (request.status === "error") errorRounds++;
    }

    return {
      totals,
      totalDurationMs,
      apiDurationMs,
      toolDurationMs,
      totalToolCalls,
      iterationsSum,
      completedRounds,
      errorRounds,
      totalRounds: requests.length,
    };
  }, [requests]);

  if (requests.length === 0) {
    return <EmptyStats text="No requests yet in this conversation." />;
  }

  return (
    <div className="px-3 py-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 overflow-y-auto h-full">
      <StatSection title="Rounds">
        <StatRow label="Total turns" value={stats.totalRounds} />
        <StatRow label="Completed" value={stats.completedRounds} />
        {stats.errorRounds > 0 && (
          <StatRow
            label="Errored"
            value={stats.errorRounds}
            valueClassName="text-destructive"
          />
        )}
        <StatRow label="Σ Iterations" value={stats.iterationsSum || "—"} />
      </StatSection>

      <StatSection title="Tokens (all turns)">
        <StatRow label="Input" value={fmtTokens(stats.totals.input)} />
        <StatRow label="Cached" value={fmtTokens(stats.totals.cached)} />
        <StatRow label="Output" value={fmtTokens(stats.totals.output)} />
        <StatRow label="Total" value={fmtTokens(stats.totals.total)} />
      </StatSection>

      <StatSection title="Cost & duration">
        <StatRow label="Cost" value={fmtCost(stats.totals.cost)} />
        <StatRow label="Total" value={fmtMs(stats.totalDurationMs)} />
        <StatRow label="API" value={fmtMs(stats.apiDurationMs)} />
        <StatRow label="Tools" value={fmtMs(stats.toolDurationMs)} />
      </StatSection>

      <StatSection title="Tool calls">
        <StatRow label="Σ Tool calls" value={stats.totalToolCalls || "—"} />
        <StatRow label="LLM calls" value={stats.totals.requests || "—"} />
      </StatSection>
    </div>
  );
}
