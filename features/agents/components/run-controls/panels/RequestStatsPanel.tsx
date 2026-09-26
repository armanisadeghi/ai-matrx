"use client";

/**
 * RequestStatsPanel — server-reported stats for a single request.
 *
 * When `requestId` is provided, reads that specific ActiveRequest; otherwise
 * falls back to the newest request on the conversation. Shows tokens, cost,
 * durations, tool-call summary, and finish reason.
 */

import { useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  EmptyStats,
  StatRow,
  StatSection,
  fmtCost,
  fmtServerSeconds,
  fmtTokens,
  getUserRequestResult,
  makeSelectLastConversationRequest,
  makeSelectRequestById,
} from "./shared";

export interface RequestStatsPanelProps {
  conversationId: string;
  /** Pin the panel to a specific requestId. Defaults to the latest. */
  requestId?: string | null;
}

export function RequestStatsPanel({
  conversationId,
  requestId,
}: RequestStatsPanelProps) {
  const selector = useMemo(
    () =>
      requestId
        ? makeSelectRequestById(requestId)
        : makeSelectLastConversationRequest(conversationId),
    [requestId, conversationId],
  );
  const request = useAppSelector(selector);

  if (!request) {
    return (
      <EmptyStats
        text={
          requestId
            ? "No debug data for this response in the current session. Request info is only captured live."
            : "No requests yet. Fire a turn to see stats here."
        }
      />
    );
  }

  const result = getUserRequestResult(request);
  const usage = result?.total_usage?.total;
  const timing = result?.timing_stats ?? undefined;
  const toolStats = result?.tool_call_stats ?? undefined;
  const isComplete =
    request.status === "complete" || request.status === "error";

  return (
    <div className="px-3 py-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 overflow-y-auto h-full">
      <StatSection title="Status">
        <StatRow label="Request" value={request.status} />
        <StatRow label="Finish reason" value={result?.finish_reason ?? "—"} />
        <StatRow
          label="Iterations"
          value={result?.iterations != null ? String(result.iterations) : "—"}
        />
        {request.error && (
          <>
            <StatRow
              label="Error"
              value={`[${request.error.error_type}${
                request.error.code ? `:${request.error.code}` : ""
              }] ${request.error.message}`}
              valueClassName="text-destructive text-[10px]"
            />
            {request.error.user_message && (
              <StatRow
                label="User message"
                value={request.error.user_message}
                valueClassName="text-destructive text-[10px]"
              />
            )}
          </>
        )}
      </StatSection>

      <StatSection title="Tokens">
        <StatRow label="Input" value={fmtTokens(usage?.input_tokens)} />
        <StatRow
          label="Cached in"
          value={fmtTokens(usage?.cached_input_tokens)}
        />
        <StatRow label="Output" value={fmtTokens(usage?.output_tokens)} />
        <StatRow label="Total" value={fmtTokens(usage?.total_tokens)} />
      </StatSection>

      <StatSection title="Cost & duration">
        <StatRow label="Cost" value={fmtCost(usage?.total_cost)} />
        <StatRow label="Total" value={fmtServerSeconds(timing?.total_duration)} />
        <StatRow label="API" value={fmtServerSeconds(timing?.api_duration)} />
        <StatRow label="Tools" value={fmtServerSeconds(timing?.tool_duration)} />
      </StatSection>

      <StatSection title="Tools">
        <StatRow
          label="Tool calls"
          value={
            toolStats?.total_tool_calls != null
              ? String(toolStats.total_tool_calls)
              : "—"
          }
        />
        <StatRow
          label="Iters w/ tools"
          value={
            toolStats?.iterations_with_tools != null
              ? String(toolStats.iterations_with_tools)
              : "—"
          }
        />
        <StatRow
          label="Tool types"
          value={
            toolStats?.by_tool ? Object.keys(toolStats.by_tool).length : "—"
          }
        />
        {!isComplete && (
          <StatRow
            label="State"
            value="streaming…"
            valueClassName="text-blue-500 text-[10px]"
          />
        )}
      </StatSection>
    </div>
  );
}
