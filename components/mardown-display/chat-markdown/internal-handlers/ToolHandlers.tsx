"use client";

/**
 * ToolHandlers — inline tool-call cards for the markdown stream.
 *
 * Two active surfaces:
 *   - `InlineToolCard`    — live stream path, one card per tool callId
 *     inside an active request. Reads `ToolLifecycleEntry` from Redux.
 *   - `DbToolCard`        — DB-loaded turn path. Builds a synthetic
 *     `ToolLifecycleEntry` from a persisted content segment.
 *
 * Both route through the canonical shell at
 * `@/features/tool-call-visualization` — there is no more reshaping
 * into the deprecated `ToolCallObject` format.
 */

import React, { useMemo } from "react";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectHideToolResults } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import {
  selectToolLifecycle,
  type ContentSegmentDbTool,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { ToolCallVisualization } from "@/features/tool-call-visualization/components/ToolCallVisualization";

// ============================================================================
// INLINE TOOL CARD — subscribes to a single tool's lifecycle by callId.
// Renders independently; only re-renders when this specific tool changes.
// ============================================================================

interface InlineToolCardProps {
  requestId: string;
  callId: string;
  /**
   * Owning conversation id. Required so this card can self-gate on the
   * instance-level `hideToolResults` flag — when true, this component
   * renders nothing. Centralizing the visibility check here means a single
   * setting silences every tool call on the surface with no scattered
   * conditionals.
   */
  conversationId: string;
}

export const InlineToolCard: React.FC<InlineToolCardProps> = ({
  requestId,
  callId,
  conversationId,
}) => {
  const hidden = useAppSelector(selectHideToolResults(conversationId));
  const lifecycle = useAppSelector(selectToolLifecycle(requestId, callId));

  if (hidden) return null;
  if (!lifecycle) return null;

  return (
    <ToolCallVisualization
      entries={[lifecycle]}
      requestId={requestId}
      conversationId={conversationId}
      hasContent
    />
  );
};

// ============================================================================
// DB TOOL CARD — renders a completed tool call from DB-loaded message parts.
// ============================================================================

interface DbToolCardProps {
  segment: ContentSegmentDbTool;
  /** Owning conversation id — drives the `hideToolResults` check. */
  conversationId: string;
}

export const DbToolCard: React.FC<DbToolCardProps> = ({
  segment,
  conversationId,
}) => {
  const hidden = useAppSelector(selectHideToolResults(conversationId));

  const entry = useMemo<ToolLifecycleEntry>(() => {
    // DB stores result as a JSON string — parse it so renderers see the
    // same shape as the live-stream path.
    let parsedResult: unknown = segment.result;
    if (typeof parsedResult === "string" && !segment.isError) {
      try {
        parsedResult = JSON.parse(parsedResult);
      } catch {
        // leave as raw string if not valid JSON
      }
    }

    const now = new Date().toISOString();
    return {
      callId: segment.callId,
      toolName: segment.toolName,
      displayName: segment.toolName,
      status: segment.isError ? "error" : "completed",
      arguments: segment.arguments ?? {},
      startedAt: now,
      completedAt: now,
      latestMessage: null,
      latestData: null,
      result: segment.isError ? null : parsedResult,
      resultPreview: null,
      errorType: null,
      errorMessage: segment.isError
        ? typeof segment.result === "string"
          ? segment.result
          : JSON.stringify(segment.result)
        : null,
      isDelegated: false,
      events: [],
    };
  }, [
    segment.callId,
    segment.toolName,
    segment.arguments,
    segment.result,
    segment.isError,
  ]);

  if (hidden) return null;

  return (
    <ToolCallVisualization
      entries={[entry]}
      conversationId={conversationId}
      hasContent
      isPersisted
    />
  );
};
