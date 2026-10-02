"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Info, Eye } from "lucide-react";

import { ToolCallVisualization } from "@ai-matrx/chat/tool-call-visualization/components/ToolCallVisualization";
import { hasCustomRenderer } from "@ai-matrx/chat/tool-call-visualization/registry/registry";
import type { ToolLifecycleEntry } from "@ai-matrx/chat/agents/types/request.types";
import type { ToolEventPayload } from "@ai-matrx/agents/generated/stream-events";
import type { ToolStreamEvent, FinalPayload } from "./types";

/**
 * Build a canonical `ToolLifecycleEntry` from the tool-testing stream events
 * and final payload so the preview renders identically to the live agent-run
 * visualization.
 */
function buildLifecycleEntry(
  toolName: string,
  args: Record<string, unknown>,
  toolEvents: ToolStreamEvent[],
  finalPayload: FinalPayload | null,
): ToolLifecycleEntry {
  const callId = toolEvents[0]?.call_id ?? "test-call";
  const startedAt = new Date().toISOString();

  // Re-shape the local ToolStreamEvent[] into ToolEventPayload[] so
  // renderers that walk `entry.events` see the exact wire shape.
  const events: ToolEventPayload[] = toolEvents.map(
    (e) =>
      ({
        event: e.event,
        call_id: e.call_id,
        tool_name: e.tool_name,
        timestamp: e.timestamp,
        message: e.message,
        show_spinner: e.show_spinner,
        data: e.data,
      }) as unknown as ToolEventPayload,
  );

  const errorEvent = toolEvents.find((e) => e.event === "tool_error");
  const completedEvent = toolEvents.find((e) => e.event === "tool_completed");
  const latestProgress = [...toolEvents]
    .reverse()
    .find((e) => e.event === "tool_progress" || e.event === "tool_step");

  const completedAt =
    completedEvent || errorEvent ? new Date().toISOString() : null;

  const finalResult =
    (finalPayload?.output as { full_result?: { output?: unknown } } | null)
      ?.full_result?.output ??
    (completedEvent?.data.result as unknown) ??
    null;

  const status: ToolLifecycleEntry["status"] = errorEvent
    ? "error"
    : completedEvent || finalResult !== null
      ? "completed"
      : latestProgress
        ? "progress"
        : "started";

  return {
    callId,
    toolName,
    displayName: toolName,
    status,
    arguments: args,
    startedAt,
    completedAt,
    latestMessage: latestProgress?.message ?? null,
    latestData:
      latestProgress && Object.keys(latestProgress.data).length > 0
        ? latestProgress.data
        : null,
    result: errorEvent ? null : finalResult,
    resultPreview: null,
    errorType: null,
    errorMessage: errorEvent
      ? typeof errorEvent.message === "string"
        ? errorEvent.message
        : "Tool execution failed"
      : null,
    isDelegated: false,
    events,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ToolRendererPreviewProps {
  toolName: string;
  args: Record<string, unknown>;
  toolEvents: ToolStreamEvent[];
  finalPayload: FinalPayload | null;
  isRunning: boolean;
}

export function ToolRendererPreview({
  toolName,
  args,
  toolEvents,
  finalPayload,
  isRunning,
}: ToolRendererPreviewProps) {
  const hasRenderer = hasCustomRenderer(toolName);

  const entry = useMemo(
    () => buildLifecycleEntry(toolName, args, toolEvents, finalPayload),
    [toolName, args, toolEvents, finalPayload],
  );

  if (toolEvents.length === 0 && !isRunning && !finalPayload) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
        <Eye className="h-6 w-6 opacity-40" />
        <p className="text-xs">Execute a tool to see rendered results here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">Rendered via:</span>
        {hasRenderer ? (
          <Badge variant="default" className="text-[10px]">
            {toolName} (Custom)
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">
            GenericRenderer (Fallback)
          </Badge>
        )}
      </div>

      <ToolCallVisualization entries={[entry]} hasContent />

      <p className="text-[10px] text-muted-foreground">
        <Info className="h-3 w-3 inline mr-1" />
        Rendering from canonical ToolLifecycleEntry · {toolEvents.length} stream
        events · status: {entry.status}
      </p>
    </div>
  );
}
