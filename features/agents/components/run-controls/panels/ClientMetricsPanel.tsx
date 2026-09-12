"use client";

/**
 * ClientMetricsPanel — client-side perf for a single request.
 *
 * Populated at stream end. When `requestId` is provided, reads that specific
 * ActiveRequest; otherwise falls back to the newest request on the
 * conversation. Shows TTFT, stream duration, render delay, payload bytes,
 * and the per-event-type counts collected by the stream runtime.
 */

import { useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { formatFileSize } from "@ai-matrx/kit/format";
import {
  EmptyStats,
  StatRow,
  StatSection,
  fmtMs,
  makeSelectLastConversationRequest,
  makeSelectRequestById,
} from "./shared";

export interface ClientMetricsPanelProps {
  conversationId: string;
  /** Pin to a specific requestId. Defaults to the latest. */
  requestId?: string | null;
}

export function ClientMetricsPanel({
  conversationId,
  requestId,
}: ClientMetricsPanelProps) {
  const selector = useMemo(
    () =>
      requestId
        ? makeSelectRequestById(requestId)
        : makeSelectLastConversationRequest(conversationId),
    [requestId, conversationId],
  );
  const request = useAppSelector(selector);
  const metrics = request?.clientMetrics ?? null;

  if (!metrics) {
    return (
      <EmptyStats
        text={
          requestId
            ? "No client metrics for this response in the current session."
            : "Client metrics populate at stream end. No completed request yet for this conversation."
        }
      />
    );
  }

  return (
    <div className="px-3 py-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 overflow-y-auto h-full">
      <StatSection title="Timing">
        <StatRow
          label="Internal latency"
          value={fmtMs(metrics.internalLatencyMs)}
        />
        <StatRow label="TTFT" value={fmtMs(metrics.ttftMs)} />
        <StatRow
          label="Stream duration"
          value={fmtMs(metrics.streamDurationMs)}
        />
        <StatRow label="Render delay" value={fmtMs(metrics.renderDelayMs)} />
        <StatRow
          label="Total client"
          value={fmtMs(metrics.totalClientDurationMs)}
        />
      </StatSection>

      <StatSection title="Payload">
        <StatRow
          label="Accumulated text"
          value={formatFileSize(metrics.accumulatedTextBytes)}
        />
        <StatRow label="Total" value={formatFileSize(metrics.totalPayloadBytes)} />
      </StatSection>

      <StatSection title="Event counts">
        <StatRow label="Total" value={metrics.totalEvents} />
        <StatRow label="Chunks" value={metrics.chunkEvents} />
        <StatRow label="Reasoning" value={metrics.reasoningChunkEvents} />
        <StatRow label="Phases" value={metrics.phaseEvents} />
        <StatRow label="Tool events" value={metrics.toolEvents} />
        <StatRow label="Render blocks" value={metrics.renderBlockEvents} />
      </StatSection>

      <StatSection title="Records">
        <StatRow label="Init" value={metrics.initEvents} />
        <StatRow label="Completion" value={metrics.completionEvents} />
        <StatRow label="Data" value={metrics.dataEvents} />
        <StatRow label="Reserved" value={metrics.recordReservedEvents} />
        <StatRow label="Updated" value={metrics.recordUpdateEvents} />
        <StatRow label="FS Changes" value={metrics.resourceChangedEvents} />
        {metrics.warningEvents > 0 && (
          <StatRow
            label="Warnings"
            value={metrics.warningEvents}
            valueClassName="text-amber-500"
          />
        )}
        {metrics.infoEvents > 0 && (
          <StatRow label="Info" value={metrics.infoEvents} />
        )}
        {metrics.otherEvents > 0 && (
          <StatRow label="Other" value={metrics.otherEvents} />
        )}
      </StatSection>
    </div>
  );
}
