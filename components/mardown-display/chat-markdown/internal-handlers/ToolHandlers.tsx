"use client";

/**
 * ToolHandlers — inline tool-call cards for the markdown stream.
 *
 * ONE card component (`ToolCard`) and ONE batch component (`ToolBatch`) for
 * both sources: the live stream (`requestId` → `ToolLifecycleEntry` from
 * Redux) and a committed/reloaded turn (a persisted content segment →
 * `persistedToolEntry`). One element type under one key is what keeps a card
 * the same instance when a turn swaps from stream to record.
 *
 * Both route through the canonical shell at
 * `@/features/tool-call-visualization`.
 */

import React from "react";

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
// TOOL CARD — THE one element for a tool call in a transcript, live or
// persisted. The live stream feeds it `requestId` (it subscribes to that one
// call's lifecycle); a committed/reloaded turn feeds it the persisted
// `segment`. Because both paths render THIS component under the same key
// (`tool-<callId>`), the card is the SAME React instance — and the same DOM
// node — when a turn swaps from its live stream to its committed record: no
// unmount, no blank frame, no lost expand state (verifier 2026-09-26 r4).
// ============================================================================

export interface ToolCardProps {
  callId: string;
  /**
   * Owning conversation id. Required so this card can self-gate on the
   * instance-level `hideToolResults` flag — when true, this component
   * renders nothing. Centralizing the show/hide check here means a single
   * setting silences every tool call on the surface with no scattered
   * conditionals.
   */
  conversationId: string;
  /** Live source: the request whose lifecycle carries this call. */
  requestId?: string;
  /** Persisted source: the committed tool_call part joined to its row. */
  segment?: ContentSegmentDbTool;
}

const _selectNoLifecycle = () => undefined;

export const ToolCard: React.FC<ToolCardProps> = ({
  callId,
  conversationId,
  requestId,
  segment,
}) => {
  const hidden = useAppSelector(selectHideToolResults(conversationId));
  const lifecycle = useAppSelector(
    !segment && requestId
      ? selectToolLifecycle(requestId, callId)
      : _selectNoLifecycle,
  );

  // Canonical persisted→lifecycle conversion lives in `persistedToolEntry`:
  // it reads the full `execution_events` log + real timestamps off the joined
  // `cx_tool_call` row, so a persisted tool renders identically to the live one.
  const entry: ToolLifecycleEntry | undefined = segment
    ? persistedToolEntry(segment)
    : lifecycle;

  if (hidden) return null;
  if (!entry) return null;

  return (
    <ToolCallVisualization
      entries={[entry]}
      requestId={segment ? undefined : requestId}
      conversationId={conversationId}
      hasContent
      isPersisted={!!segment}
    />
  );
};

// ============================================================================
// TOOL BATCH — folds a run of consecutive tool calls into one expandable
// line, live (`requestId` + `callIds`) or persisted (`segments`), rendering
// the normal `ToolCard`s as children. Same one-component rule as the card:
// the batch and every card inside it keep their identity across the swap.
// ============================================================================

export interface ToolBatchProps {
  conversationId: string;
  /** Live source. */
  requestId?: string;
  callIds?: string[];
  /** Persisted source. */
  segments?: ContentSegmentDbTool[];
  browserRunOrder?: number;
  browserBreakBefore?: boolean;
  browserBreakAfter?: boolean;
}

const _selectNoLifecycleMap = () => undefined;

export const ToolBatch: React.FC<ToolBatchProps> = ({
  conversationId,
  requestId,
  callIds,
  segments,
  browserRunOrder,
  browserBreakBefore,
  browserBreakAfter,
}) => {
  const hidden = useAppSelector(selectHideToolResults(conversationId));
  const lifecycleMap = useAppSelector(
    !segments && requestId
      ? selectToolLifecycleMap(requestId)
      : _selectNoLifecycleMap,
  );

  // React Compiler memoizes this — no manual useMemo (per repo convention).
  const ids: string[] = segments
    ? segments.map((s) => s.callId)
    : (callIds ?? []);
  const entries: ToolLifecycleEntry[] = [];
  if (segments) {
    for (const s of segments) entries.push(persistedToolEntry(s));
  } else if (lifecycleMap) {
    for (const id of ids) {
      const e = lifecycleMap[id];
      if (e) entries.push(e);
    }
  }

  if (hidden) return null;
  if (entries.length === 0) return null;

  return (
    <ToolCallBatch
      entries={entries}
      conversationId={conversationId}
      isPersisted={!!segments}
      browserRunOrder={browserRunOrder}
      browserBreakBefore={browserBreakBefore}
      browserBreakAfter={browserBreakAfter}
    >
      {segments
        ? segments.map((segment) => (
            <ToolCard
              key={segment.callId}
              callId={segment.callId}
              segment={segment}
              conversationId={conversationId}
            />
          ))
        : ids.map((callId) => (
            <ToolCard
              key={callId}
              callId={callId}
              requestId={requestId}
              conversationId={conversationId}
            />
          ))}
    </ToolCallBatch>
  );
};
