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

import React, { useEffect, useMemo } from "react";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectHideToolResults } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import {
  selectToolLifecycle,
  selectToolLifecycleMap,
  type ContentSegmentDbTool,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { ToolCallVisualization } from "@/features/tool-call-visualization/components/ToolCallVisualization";
import { ToolCallBatch } from "@/features/tool-call-visualization/components/ToolCallBatch";
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

  // TEMP DIAGNOSTIC (stream-result loss) — remove once pinpointed. Logs on the
  // transition: if `hasResult` flips true→false (or `lifecycle` goes undefined)
  // when a stream ends, the live entry is being cleared in Redux; if it stays
  // true while the card empties, the loss is in the renderer/overlay path; if
  // this card STOPS logging at stream-end (and DbToolCard starts), the render
  // flipped to the persisted DB path.
  useEffect(() => {
    console.log("[STREAM-RESULT-DEBUG] InlineToolCard", {
      requestId,
      callId,
      toolName: lifecycle?.toolName,
      status: lifecycle?.status,
      hasLifecycle: !!lifecycle,
      hasResult: lifecycle?.result != null,
      eventCount: lifecycle?.events?.length ?? 0,
    });
  }, [
    requestId,
    callId,
    lifecycle?.toolName,
    lifecycle?.status,
    lifecycle,
    lifecycle?.result,
    lifecycle?.events?.length,
  ]);

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
// INLINE TOOL BATCH — folds a run of consecutive LIVE tool calls into one
// expandable line. Subscribes once to the request's lifecycle map, derives the
// run's entries (count + streaming state), and renders the normal single-tool
// cards as children — no reshaping, no nesting that deforms the cards.
// ============================================================================

interface InlineToolBatchProps {
  requestId: string;
  callIds: string[];
  conversationId: string;
}

export const InlineToolBatch: React.FC<InlineToolBatchProps> = ({
  requestId,
  callIds,
  conversationId,
}) => {
  const hidden = useAppSelector(selectHideToolResults(conversationId));
  const lifecycleMap = useAppSelector(selectToolLifecycleMap(requestId));

  // React Compiler memoizes this — no manual useMemo (per repo convention).
  const entries: ToolLifecycleEntry[] = [];
  if (lifecycleMap) {
    for (const id of callIds) {
      const e = lifecycleMap[id];
      if (e) entries.push(e);
    }
  }

  if (hidden) return null;
  if (entries.length === 0) return null;

  return (
    <ToolCallBatch entries={entries} conversationId={conversationId}>
      {callIds.map((callId) => (
        <InlineToolCard
          key={callId}
          requestId={requestId}
          callId={callId}
          conversationId={conversationId}
        />
      ))}
    </ToolCallBatch>
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

  // TEMP DIAGNOSTIC (stream-result loss) — remove once pinpointed. If this
  // starts firing the instant a stream ends (while InlineToolCard stops), the
  // renderer flipped to the persisted DB path mid-session; `hasResult` then
  // tells us whether that path has the result (observability row populated) or
  // is empty (the real gap).
  useEffect(() => {
    const e = persistedToolEntry(segment);
    console.log("[STREAM-RESULT-DEBUG] DbToolCard", {
      callId: segment.callId,
      toolName: e.toolName,
      status: e.status,
      hasRecord: !!segment.record,
      recordHasOutput: !!segment.record?.output,
      hasResult: e.result != null,
    });
  }, [segment.callId, segment.record, segment.stubName, segment.stubArguments]);

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

// ============================================================================
// DB TOOL BATCH — folds a run of consecutive PERSISTED tool calls (DB-loaded)
// into one expandable line. Mirror of InlineToolBatch for the reload path:
// converts each segment to a lifecycle entry, renders the normal DbToolCards
// as children. All persisted tools are terminal, so the batch defaults
// collapsed.
// ============================================================================

interface DbToolBatchProps {
  segments: ContentSegmentDbTool[];
  conversationId: string;
}

export const DbToolBatch: React.FC<DbToolBatchProps> = ({
  segments,
  conversationId,
}) => {
  const hidden = useAppSelector(selectHideToolResults(conversationId));

  // React Compiler memoizes this — no manual useMemo (per repo convention).
  const entries: ToolLifecycleEntry[] = segments.map((s) =>
    persistedToolEntry(s),
  );

  if (hidden) return null;
  if (segments.length === 0) return null;

  return (
    <ToolCallBatch entries={entries} conversationId={conversationId} isPersisted>
      {segments.map((segment, i) => (
        <DbToolCard
          key={`${segment.callId}-${i}`}
          segment={segment}
          conversationId={conversationId}
        />
      ))}
    </ToolCallBatch>
  );
};
