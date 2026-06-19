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
import { ToolCallVisualization } from "@/features/tool-call-visualization/components/ToolCallVisualization";
import { persistedToolEntry } from "@/features/tool-call-visualization/utils/cxToolCallToLifecycleEntry";

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

  // Canonical persisted→lifecycle conversion lives in `persistedToolEntry`:
  // it reads the full `execution_events` log + real timestamps off the joined
  // `cx_tool_call` row, so a reloaded tool renders identically to the live one.
  const entry = useMemo(
    () => persistedToolEntry(segment),
    [segment.callId, segment.record, segment.stubName, segment.stubArguments],
  );

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
